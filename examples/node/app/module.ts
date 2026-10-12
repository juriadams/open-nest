import { Module } from "@nestjs/common";

import { AppController } from "./controller.ts";

@Module({ controllers: [AppController] })
export class AppModule {}
