import "reflect-metadata";

import { createNodeServer } from "@open-nest/node";

import { AppModule } from "@/app/module";

// Create a new Node Server.
const server = await createNodeServer({
  module: AppModule,
  port: Number(process.env.PORT ?? 3000),
});

console.log(`listening on http://localhost:${server.port}`);

// Safely shut down the Nest instance and Server.
process.on("SIGINT", async () => {
  await server.close();

  process.exit(0);
});
