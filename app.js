const state = {
  clientId: "",
  myId: "",
  users: [],
  messages: []
};

const elements = {
  myId: document.querySelector("#myId"),
  onlineCount: document.querySelector("#onlineCount"),
  userList: document.querySelector("#userList"),
  messages: document.querySelector("#messages"),
  form: document.querySelector("#messageForm"),
  input: document.querySelector("#messageInput"),
  status: document.querySelector("#connectionStatus")
};

connect();

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = elements.input.value.trim();
  if (!text) return;

  elements.input.value = "";
  elements.input.focus();

  const response = await fetch("/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Id": state.clientId
    },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    elements.input.value = text;
    setStatus("전송 실패", "offline");
  }
});

function connect() {
  const source = new EventSource("/events");
  setStatus("연결 중", "");

  source.addEventListener("open", () => {
    setStatus("연결됨", "connected");
  });

  source.addEventListener("hello", (event) => {
    const data = JSON.parse(event.data);
    state.clientId = data.clientId;
    state.myId = data.user.id;
    state.users = data.users;
    state.messages = data.messages;
    render();
  });

  source.addEventListener("users", (event) => {
    state.users = JSON.parse(event.data).users;
    renderUsers();
  });

  source.addEventListener("message", (event) => {
    state.messages.push(JSON.parse(event.data));
    if (state.messages.length > 120) state.messages.shift();
    renderMessages();
  });

  source.addEventListener("error", () => {
    setStatus("재연결 중", "offline");
  });
}

function render() {
  elements.myId.textContent = state.myId || "연결 중";
  renderUsers();
  renderMessages();
}

function renderUsers() {
  elements.onlineCount.textContent = String(state.users.length);
  elements.userList.replaceChildren(
    ...state.users.map((user) => {
      const item = document.createElement("li");
      item.textContent = user.id;
      return item;
    })
  );
}

function renderMessages() {
  elements.messages.replaceChildren(
    ...state.messages.map((message) => {
      const item = document.createElement("li");
      item.className = ["message", message.type, message.userId === state.myId ? "mine" : ""].filter(Boolean).join(" ");

      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = message.text;
      item.append(bubble);

      if (message.type !== "system") {
        const meta = document.createElement("div");
        meta.className = "meta";
        meta.append(createSpan(message.userId), createSpan(formatTime(message.createdAt)));
        item.append(meta);
      }

      return item;
    })
  );

  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function createSpan(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function setStatus(text, className) {
  elements.status.textContent = text;
  elements.status.className = ["status", className].filter(Boolean).join(" ");
}
