import "reflect-metadata";
import { createBunServer } from "@/adapters/bun";
import { AppModule } from "./app/module";

// Create a new Bun Server.
const server = await createBunServer({
  module: AppModule,
  port: 3000,
});

console.log(`listening on http://localhost:${server.port}`);

// Safely shut down Nest instance and Server.
process.on("SIGINT", async () => {
  await server.close();

  process.exit(0);
});
