import "reflect-metadata";
import { afterAll, describe, expect, test } from "bun:test";
import { Controller, Get, Module } from "@nestjs/common";
import {
  createWorkerFetcher,
  workerContext,
  type WorkerExecutionContext,
  type WorkerFetcher,
} from "@/adapters/workers";

interface Env {
  name: string;
}

@Controller()
class TestController {
  @Get()
  home() {
    const { env, ctx } = workerContext<Env>();

    ctx.waitUntil(Promise.resolve(env.name));

    return { name: env.name };
  }
}

@Module({ controllers: [TestController] })
class TestAppModule {}

function context(): WorkerExecutionContext & { waited: Promise<unknown>[] } {
  const waited: Promise<unknown>[] = [];

  return {
    waited,
    waitUntil(promise) {
      waited.push(promise);
    },
    passThroughOnException() {},
  };
}

describe("workers", () => {
  const fetcher: WorkerFetcher<Env> = createWorkerFetcher({
    module: TestAppModule,
  });

  afterAll(async () => {
    await fetcher.close();
  });

  test("bindings and the execution context are available during the request", async () => {
    const ctx = context();
    const response = await fetcher(
      new Request("http://localhost/"),
      { name: "open-nest" },
      ctx,
    );

    expect(await response.json()).toEqual({ name: "open-nest" });
    expect(await Promise.all(ctx.waited)).toEqual(["open-nest"]);

    const next = context();
    const again = await fetcher(
      new Request("http://localhost/"),
      { name: "other" },
      next,
    );

    expect(await again.json()).toEqual({ name: "other" });
    expect(await Promise.all(next.waited)).toEqual(["other"]);
  });

  test("reading the context outside a request throws", () => {
    expect(() => workerContext()).toThrow("Called outside a worker request.");
  });
});
