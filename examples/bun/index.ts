import "reflect-metadata";
import { Controller, Get, Module } from "@nestjs/common";
import { createFetcher } from "@/adapters/fastify";

@Controller()
class AppController {
  @Get()
  health() {
    return {
      data: null,
      error: null,
    };
  }
}

@Module({ controllers: [AppController] })
class AppModule {}

const fetch = createFetcher({ module: AppModule });

Bun.serve({
  fetch,
  port: 3000,
});

console.log("http://localhost:3000");
