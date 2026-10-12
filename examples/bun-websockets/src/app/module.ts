import { Module } from "@nestjs/common";

import { AppController } from "@/app/controller";
import { EventsGateway } from "@/app/gateway";

@Module({ controllers: [AppController], providers: [EventsGateway] })
export class AppModule {}
