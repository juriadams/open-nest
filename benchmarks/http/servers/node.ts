import "reflect-metadata";

import { Controller, Get, Module } from "@nestjs/common";
import { createNodeServer } from "@open-nest/node";

@Controller("/health")
class AppController {
  @Get()
  health() {
    return {
      data: null,
      error: null,
    };
  }
}

@Module({
  controllers: [AppController],
})
class AppModule {}

export const server = await createNodeServer({
  module: AppModule,
  port: Number(process.env.PORT) || 3000,
});

process.on("SIGINT", async () => {
  await server.close();

  process.exit(0);
});
