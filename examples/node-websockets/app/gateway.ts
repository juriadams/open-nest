import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";

@WebSocketGateway({ path: "/ws" })
export class EventsGateway {
  @SubscribeMessage("events")
  events(@MessageBody() data: string) {
    return data;
  }
}
