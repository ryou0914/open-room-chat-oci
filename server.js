const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3001);
const PUBLIC_DIR = __dirname;
const clients = new Map();
const messages = [];
let nextUserNumber = 1;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

async function handler(req, res) {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }

  if (req.method === "GET" && req.url === "/events") {
    openEventStream(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/messages") {
    await receiveMessage(req, res);
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Method Not Allowed");
}

function openEventStream(req, res) {
  const clientId = crypto.randomUUID();
  const user = { id: `Guest-${String(nextUserNumber).padStart(3, "0")}` };
  nextUserNumber += 1;

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Set-Cookie": `chatClient=${clientId}; Path=/; SameSite=Lax`
  });

  clients.set(clientId, { res, user });
  send(res, "hello", {
    clientId,
    user,
    users: getUsers(),
    messages
  });

  addMessage(createSystemMessage(`${user.id} joined the room.`));
  broadcastUsers();

  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(clientId);
    addMessage(createSystemMessage(`${user.id} left the room.`));
    broadcastUsers();
  });
}

async function receiveMessage(req, res) {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const text = String(payload.text || "").trim();
    const client = getClientByRequest(req);

    if (!client) {
      res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Could not find the connected user." }));
      return;
    }

    if (!text || text.length > 400) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Enter a message between 1 and 400 characters." }));
      return;
    }

    addMessage({
      id: crypto.randomUUID(),
      type: "chat",
      userId: client.user.id,
      text,
      createdAt: new Date().toISOString()
    });

    res.writeHead(204);
    res.end();
  } catch {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Could not read the request." }));
  }
}

function getClientByRequest(req) {
  const clientId = req.headers["x-client-id"];
  if (clientId && clients.has(clientId)) return clients.get(clientId);

  const cookie = req.headers.cookie || "";
  const match = cookie.match(/chatClient=([^;]+)/);
  if (match && clients.has(match[1])) return clients.get(match[1]);

  return null;
}

function addMessage(message) {
  messages.push(message);
  if (messages.length > 120) messages.shift();
  broadcast("message", message);
}

function createSystemMessage(text) {
  return {
    id: crypto.randomUUID(),
    type: "system",
    text,
    createdAt: new Date().toISOString()
  };
}

function broadcastUsers() {
  broadcast("users", { users: getUsers() });
}

function broadcast(event, data) {
  for (const { res } of clients.values()) {
    send(res, event, data);
  }
}

function send(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function getUsers() {
  return [...clients.values()].map((client) => client.user);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4096) {
        req.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    const type = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
}

if (require.main === module) {
  const server = http.createServer(handler);
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Open Room Chat is running on port ${PORT}`);
  });
}

module.exports = handler;
