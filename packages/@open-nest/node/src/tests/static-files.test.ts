import "reflect-metadata";

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Controller, Get, Module } from "@nestjs/common";

import { createNodeServer, type NodeServer } from "@/index";

@Controller()
class StaticController {
  @Get()
  hello() {
    return { ok: true };
  }

  @Get("static/missing")
  missing() {
    return { found: false };
  }
}

@Module({ controllers: [StaticController] })
class StaticModule {}
describe("node", () => {
  let server: NodeServer;
  let root: string;

  afterAll(async () => {
    await server?.close();

    if (root) await rm(root, { recursive: true, force: true });
  });

  describe("static files", () => {
    test("serves files, the index, a missing-file fallback, and rejects paths outside the root", async () => {
      const dir = await mkdtemp(join(tmpdir(), "open-nest-"));
      const publicDir = join(dir, "public");

      root = dir;
      await mkdir(publicDir);
      await writeFile(join(publicDir, "hello.txt"), "hello");
      await writeFile(join(publicDir, "index.html"), "<p>index</p>");
      await writeFile(join(dir, "secret.txt"), "secret");

      server = await createNodeServer({
        module: StaticModule,
        port: 0,
        opts: { logger: false },
        configure: (app) => {
          const http = app.getHttpAdapter();

          if (http.useStaticAssets) {
            http.useStaticAssets(publicDir, { prefix: "/static" });
          }
        },
      });

      const hello = await fetch(
        `http://127.0.0.1:${server.port}/static/hello.txt`,
      );
      const index = await fetch(`http://127.0.0.1:${server.port}/static/`);
      const head = await fetch(
        `http://127.0.0.1:${server.port}/static/hello.txt`,
        {
          method: "HEAD",
        },
      );
      const missing = await fetch(
        `http://127.0.0.1:${server.port}/static/missing`,
      );
      const escaped = await fetch(
        `http://127.0.0.1:${server.port}/static/..%2fsecret.txt`,
      );

      expect(await hello.text()).toBe("hello");
      expect(hello.headers.get("content-type")).toContain("text/plain");
      expect(await index.text()).toBe("<p>index</p>");
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
      expect(head.headers.get("content-type")).toContain("text/plain");
      expect(await missing.json()).toEqual({ found: false });
      expect(await escaped.text()).not.toBe("secret");
    });
  });
});
