import "reflect-metadata";
import { afterAll, describe, expect, test } from "bun:test";
import { Body, Controller, Get, Module, Post } from "@nestjs/common";
import { createFetcher } from "@/adapters/express";

@Controller()
class TestController {
  @Get()
  hello() {
    return { ok: true };
  }

  @Post("echo")
  echo(@Body() body: unknown) {
    return body;
  }
}

@Module({ controllers: [TestController] })
class AppModule {}

describe("adapters ", () => {
  describe("express", () => {
    const fetch = createFetcher({ module: AppModule });

    afterAll(() => fetch.close());

    test("GET /", async () => {
      const res = await fetch(new Request("http://localhost/"));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });

    test("POST /echo", async () => {
      const res = await fetch(
        new Request("http://localhost/echo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ n: 1 }),
        }),
      );

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ n: 1 });
    });

    test("unknown route", async () => {
      const res = await fetch(new Request("http://localhost/missing"));

      expect(res.status).toBe(404);
    });
  });
});
