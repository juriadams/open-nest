import "reflect-metadata";

import { createNodeServer } from "@/adapters/node";

import { AppModule } from "./app/module.ts";

// Create a new Node Server.
const server = await createNodeServer({
  module: AppModule,
  port: 3000,
});

console.log(`listening on http://localhost:${server.port}`);

// Safely shut down the Nest instance and Server.
process.on("SIGINT", async () => {
  await server.close();

  process.exit(0);
});
