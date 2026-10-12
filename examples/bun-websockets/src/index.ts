import "reflect-metadata";

import { BunWsAdapter, createBunServer } from "@open-nest/bun";

import { AppModule } from "@/app/module";

// Create a new Bun Server.
const server = await createBunServer({
  module: AppModule,
  port: 4002,
  configure: (app) => {
    app.useWebSocketAdapter(new BunWsAdapter());
  },
});

console.log(`listening on http://localhost:${server.port}`);

// Create a new WebSocket Client.
const client = new WebSocket(`ws://localhost:${server.port}/ws`);

client.onmessage = (event) => {
  const payload = JSON.parse(String(event.data));

  console.log(`received: \`${JSON.stringify(payload)}\``);
};

client.onopen = () => {
  console.log("connected to server");
};

const timer = setInterval(() => {
  if (client.readyState !== WebSocket.OPEN) return;

  const payload = JSON.stringify({ event: "events", data: "hello" });
  client.send(payload);

  console.log(`sent: \`${payload}\``);
}, 1000);

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(async () => {
    clearInterval(timer);
    client.close();
    await server.close();
  });
}

// Safely shut down WebSocket Client, Nest instance and Server.
process.on("SIGINT", async () => {
  clearInterval(timer);
  client.close();

  await server.close();

  process.exit(0);
});
