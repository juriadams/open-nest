import { Controller, Get } from "@nestjs/common";

import { workerContext } from "@/adapters/workers";

import type { Env } from "./env";

@Controller()
export class AppController {
  @Get("/")
  async index() {
    const { env, ctx } = workerContext<Env>();

    // Read something from a KV Binding.
    const lastOpenedAt = await env.CACHE.get("last-opened-at");

    // Write something to a KV Binding.
    ctx.waitUntil(env.CACHE.put("last-opened-at", new Date().toISOString()));

    return {
      data: {
        // Read variables from Bindings.
        app: env.APP_NAME,
        message: `Hello, World! This page was ${lastOpenedAt ? `last opened at ${lastOpenedAt}` : "never opened before"}`,
      },
      error: null,
    };
  }
}
