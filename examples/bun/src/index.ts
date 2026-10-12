import "reflect-metadata";

import { createBunServer } from "@open-nest/bun";

import { AppModule } from "@/app/module";

// Create a new Bun Server.
const server = await createBunServer({
  module: AppModule,
  port: 4001,
});

console.log(`listening on http://localhost:${server.port}`);

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(async () => {
    await server.close();
  });
}

// Safely shut down Nest instance and Server.
process.on("SIGINT", async () => {
  await server.close();

  process.exit(0);
});
