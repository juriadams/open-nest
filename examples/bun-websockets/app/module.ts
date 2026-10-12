import { Module } from "@nestjs/common";
import { AppController } from "./controller";
import { EventsGateway } from "./gateway";

@Module({ controllers: [AppController], providers: [EventsGateway] })
export class AppModule {}
