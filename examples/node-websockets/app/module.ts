import { Module } from "@nestjs/common";
import { AppController } from "./controller.ts";
import { EventsGateway } from "./gateway.ts";

@Module({ controllers: [AppController], providers: [EventsGateway] })
export class AppModule {}
