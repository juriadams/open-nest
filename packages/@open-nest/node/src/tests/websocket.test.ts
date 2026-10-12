import "reflect-metadata";

import { afterAll, describe, expect, test } from "bun:test";
import { Controller, Get, Module } from "@nestjs/common";
import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";

import { createNodeServer, NodeWsAdapter, type NodeServer } from "@/index";

@WebSocketGateway({ path: "/ws" })
class EventsGateway {
  @SubscribeMessage("events")
  events(@MessageBody() data: string) {
    return data;
  }
}

@Controller()
class TestController {
  @Get()
  hello() {
    return { ok: true };
  }
}

@Module({ controllers: [TestController], providers: [EventsGateway] })
class TestAppModule {}

describe("node", () => {
  let server: NodeServer;

  afterAll(async () => {
    await server?.close();
  });

  describe("websocket", () => {
    test("echoes events and still serves HTTP", async () => {
      server = await createNodeServer({
        module: TestAppModule,
        port: 0,
        opts: { logger: false },
        configure: (app) => {
          app.useWebSocketAdapter(new NodeWsAdapter());
        },
      });

      const message = await new Promise<{ event: string; data: string }>(
        (resolve, reject) => {
          const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);

          ws.onmessage = (event) => {
            resolve(JSON.parse(String(event.data)));
            ws.close();
          };
          ws.onopen = () => {
            ws.send(JSON.stringify({ event: "events", data: "hi" }));
          };
          ws.onerror = () => reject(new Error("websocket failed"));
        },
      );
      const res = await fetch(`http://127.0.0.1:${server.port}/`);

      expect(message).toEqual({ event: "events", data: "hi" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });
  });
});
