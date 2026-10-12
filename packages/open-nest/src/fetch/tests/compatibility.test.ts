import "reflect-metadata";

import { afterAll, describe, expect, test } from "bun:test";
import {
  Controller,
  Get,
  Module,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import express from "express";
import helmet from "helmet";

import { createFetcher } from "@/fetch";
import type { ExpressRequest, ExpressResponse } from "@/lib/express";

@Controller()
class ExpressController {
  @Get()
  hello() {
    return { ok: true };
  }

  @Post("echo")
  echo(@Req() req: ExpressRequest) {
    return req.body;
  }

  @Post("raw")
  raw(@Req() req: ExpressRequest) {
    return new Promise<{ text: string }>((resolve, reject) => {
      const chunks: Buffer[] = [];

      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve({ text: Buffer.concat(chunks).toString() }));
      req.on("error", reject);
    });
  }

  @Get("denied")
  denied(@Res() res: ExpressResponse) {
    res.status(401).send({ error: 401 });
  }

  @Get("shop")
  shop(@Res() res: ExpressResponse) {
    res.redirect(301, "/docs/shop");
  }

  @Get("pdf")
  pdf(@Res() res: ExpressResponse) {
    res.set({ "Content-Type": "application/pdf" });
    res.send(new Uint8Array([1, 2, 3]));
  }

  @Post("upload")
  @UseInterceptors(FileInterceptor("file"))
  upload(
    @UploadedFile()
    file: { originalname: string; size: number; buffer: Buffer },
  ) {
    return {
      name: file.originalname,
      size: file.size,
      text: file.buffer.toString(),
    };
  }
}

@Module({ controllers: [ExpressController] })
class ExpressModule {}

describe("compatibility", () => {
  const fetch = createFetcher({
    module: ExpressModule,
    opts: { logger: false },
    configure: (app) => {
      app.use((req: ExpressRequest, res: ExpressResponse, next: () => void) => {
        res.setHeader("x-method", req.method);
        res.setHeader("x-path", req.path);
        next();
      });
      app.use(
        (req: ExpressRequest, _res: ExpressResponse, next: () => void) => {
          if (req.path === "/raw") req._body = true;

          next();
        },
      );
      app.use("/docs", (req: ExpressRequest, res: ExpressResponse) => {
        res.send(req.path);
      });
      app.use(["/a", "/b"], (req: ExpressRequest, res: ExpressResponse) => {
        res.send(req.path);
      });
      app.use(helmet());
      app.use(express.json({ limit: "8b" }));
      app.enableCors({
        origin: [/^https:\/\/(?:[a-z0-9-]+\.)*inexogy\.com$/i, /localhost/],
        credentials: true,
      });
    },
  });

  afterAll(() => fetch.close());

  describe("express", () => {
    test("middleware reads method and path", async () => {
      const res = await fetch(new Request("http://localhost/"));

      expect(res.headers.get("x-method")).toBe("GET");
      expect(res.headers.get("x-path")).toBe("/");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    });

    test("mounted paths are stripped", async () => {
      const docs = await fetch(new Request("http://localhost/docs/buildings"));
      const root = await fetch(new Request("http://localhost/docs"));
      const a = await fetch(new Request("http://localhost/a/item"));
      const b = await fetch(new Request("http://localhost/b"));

      expect(await docs.text()).toBe("/buildings");
      expect(await root.text()).toBe("/");
      expect(await a.text()).toBe("/item");
      expect(await b.text()).toBe("/");
    });

    test("json parses a body and skips when _body is set", async () => {
      const parsed = await fetch(
        new Request("http://localhost/echo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ n: 1 }),
        }),
      );
      const raw = await fetch(
        new Request("http://localhost/raw", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ n: 1 }),
        }),
      );

      expect(parsed.status).toBe(201);
      expect(await parsed.json()).toEqual({ n: 1 });
      expect(await raw.json()).toEqual({ text: JSON.stringify({ n: 1 }) });
    });

    test("json limit errors keep their status", async () => {
      const res = await fetch(
        new Request("http://localhost/echo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: "too-long" }),
        }),
      );

      expect(res.status).toBe(413);
    });

    test("send, set, and redirect", async () => {
      const denied = await fetch(new Request("http://localhost/denied"));
      const shop = await fetch(new Request("http://localhost/shop"));
      const pdf = await fetch(new Request("http://localhost/pdf"));

      expect(denied.status).toBe(401);
      expect(await denied.json()).toEqual({ error: 401 });
      expect(shop.status).toBe(301);
      expect(shop.headers.get("location")).toBe("/docs/shop");
      expect(pdf.headers.get("content-type")).toBe("application/pdf");
      expect(new Uint8Array(await pdf.arrayBuffer())).toEqual(
        new Uint8Array([1, 2, 3]),
      );
    });

    test("cors regex reflects an allowed origin", async () => {
      const allowed = await fetch(
        new Request("http://localhost/", {
          headers: { origin: "https://app.inexogy.com" },
        }),
      );
      const local = await fetch(
        new Request("http://localhost/", {
          headers: { origin: "http://localhost:3000" },
        }),
      );
      const denied = await fetch(
        new Request("http://localhost/", {
          headers: { origin: "https://evil.example" },
        }),
      );

      expect(allowed.headers.get("access-control-allow-origin")).toBe(
        "https://app.inexogy.com",
      );
      expect(allowed.headers.get("access-control-allow-credentials")).toBe(
        "true",
      );
      expect(local.headers.get("access-control-allow-origin")).toBe(
        "http://localhost:3000",
      );
      expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    });

    test("platform-express FileInterceptor fills req.file", async () => {
      const form = new FormData();

      form.set(
        "file",
        new File(["hello"], "hello.txt", { type: "text/plain" }),
      );

      const res = await fetch(
        new Request("http://localhost/upload", { method: "POST", body: form }),
      );

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({
        name: "hello.txt",
        size: 5,
        text: "hello",
      });
    });
  });
});
