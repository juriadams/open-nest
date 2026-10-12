import "reflect-metadata";

import {
  createWorkerFetcher,
  type WorkerExecutionContext,
} from "@open-nest/workers";

import type { Env } from "@/app/env";
import { AppModule } from "@/app/module";

const fetcher = createWorkerFetcher<Env>({ module: AppModule });

export default {
  fetch: (request: Request, env: Env, ctx: WorkerExecutionContext) =>
    fetcher(request, env, ctx),
};
