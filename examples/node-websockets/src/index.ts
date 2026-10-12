import "reflect-metadata";

import { createNodeServer, NodeWsAdapter } from "@open-nest/node";

import { AppModule } from "@/app/module";

// Create a new Node Server.
const server = await createNodeServer({
  module: AppModule,
  port: 3000,
  configure: (app) => {
    app.useWebSocketAdapter(new NodeWsAdapter());
  },
});

console.log(`listening on http://localhost:${server.port}`);

// Create a new WebSocket client.
const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);

ws.onmessage = (event) => {
  const payload = JSON.parse(String(event.data));

  console.log(`received: \`${JSON.stringify(payload)}\``);
};

const timer = setInterval(() => {
  if (ws.readyState !== WebSocket.OPEN) return;

  const payload = JSON.stringify({ event: "events", data: "hello" });
  ws.send(payload);

  console.log(`sent: \`${payload}\``);
}, 1000);

// Safely shut down the WebSocket client, Nest instance and Server.
process.on("SIGINT", async () => {
  clearInterval(timer);
  ws.close();

  await server.close();

  process.exit(0);
});
