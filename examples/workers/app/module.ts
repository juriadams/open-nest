import { Module } from "@nestjs/common";

import { AppController } from "./controller";

@Module({ controllers: [AppController] })
export class AppModule {}
