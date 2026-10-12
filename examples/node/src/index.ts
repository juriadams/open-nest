import "reflect-metadata";

import { createNodeServer } from "@open-nest/node";

import { AppModule } from "@/app/module";

// Create a new Node Server.
const server = await createNodeServer({
  module: AppModule,
  port: 4003,
});

console.log(`listening on http://localhost:${server.port}`);

// Safely shut down the Nest instance and Server.
const shutdown = async () => {
  await server.close();

  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
