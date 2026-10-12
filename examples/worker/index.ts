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

const app = createFetcher({ module: AppModule });

export default {
  fetch: (request: Request) => app(request),
};
