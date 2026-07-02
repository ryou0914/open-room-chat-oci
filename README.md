# Open Room Chat OCI

A small one-room realtime chat app using Node.js, server-sent events, and plain HTML/CSS/JavaScript.

## Run locally

```bash
npm start
```

Open `http://localhost:3001`.

## VM deployment

The app listens on `0.0.0.0:3001`. On OCI, run it behind the VM public IP and allow TCP port `3001` in both the OCI security list and the instance firewall.
