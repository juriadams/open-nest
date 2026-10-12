import { AsyncLocalStorage } from "node:async_hooks";

import {
  createFetcher,
  type CreateHandlerOptions,
  type Fetcher,
} from "@/fetch";

/**
 * The `ctx` argument from a Worker `fetch` handler.
 */
export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
  readonly props?: unknown;
}

/**
 * Bindings and the raw execution context for the request in flight.
 */
export interface WorkerContext<Env> {
  env: Env;
  ctx: WorkerExecutionContext;
}

const storage = new AsyncLocalStorage<WorkerContext<unknown>>();

/**
 * Bindings and execution context for the current Worker request.
 */
export function workerContext<Env>(): WorkerContext<Env> {
  const context = storage.getStore();

  if (!context) {
    throw new Error("Called outside a worker request.");
  }

  return context as WorkerContext<Env>;
}

export interface WorkerFetcher<Env> {
  (request: Request, env: Env, ctx: WorkerExecutionContext): Promise<Response>;

  /**
   * Resolves the underlying Nest app instance.
   */
  app: Fetcher["app"];

  /**
   * Closes the underlying Nest app.
   */
  close: Fetcher["close"];
}

/**
 * `createFetcher` whose handler also receives Worker bindings and `ctx`.
 * `workerContext()` reads them for the duration of the request.
 */
export function createWorkerFetcher<Env>(
  options: CreateHandlerOptions,
): WorkerFetcher<Env> {
  const fetcher = createFetcher(options);

  const handler = (async (
    request: Request,
    env: Env,
    ctx: WorkerExecutionContext,
  ) => storage.run({ env, ctx }, () => fetcher(request))) as WorkerFetcher<Env>;

  handler.app = () => fetcher.app();
  handler.close = () => fetcher.close();

  return handler;
}
