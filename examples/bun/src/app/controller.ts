import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get("/health")
  health() {
    return {
      data: null,
      error: null,
    };
  }
}
