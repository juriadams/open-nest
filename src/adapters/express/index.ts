import { NestFactory } from "@nestjs/core";
import {
  ExpressAdapter,
  type NestExpressApplication,
} from "@nestjs/platform-express";
import type { NestApplicationOptions, Type } from "@nestjs/common";
import inject from "light-my-request";

/**
 * Options for {@link createFetcher}.
 */
export interface CreateHandlerOptions {
  /**
   * Root Nest module.
   */
  module: Type<any>;

  /**
   * Optional hook to configure the app before init (pipes, prefix, cors, ...).
   *
   * @example
   * ```ts
   * const fetch = createFetcher({
   *   module: AppModule,
   *   configure: (app) => {
   *     app.use(cors());
   *     app.use(bodyParser.json());
   *   },
   * });
   * ```
   */
  configure?: (app: NestExpressApplication) => void | Promise<void>;

  /**
   * Optional Nest factory options.
   *
   * @example
   * ```ts
   * const fetch = createFetcher({
   *   module: AppModule,
   *   opts: { logger: ["error", "warn"] },
   * });
   * ```
   */
  opts?: NestApplicationOptions;
}

export interface Fetcher {
  (request: Request): Promise<Response>;

  /**
   * Resolves the underlying Nest app instance.
   * @example
   * ```ts
   * const app = await fetch.app();
   * ```
   */
  app(): Promise<NestExpressApplication>;

  /**
   * Closes the underlying Nest app.
   *
   * @example
   * ```ts
   * await fetch.close();
   * ```
   */
  close(): Promise<void>;
}

export function createFetcher({
  module,
  configure,
  opts,
}: CreateHandlerOptions): Fetcher {
  let pending: Promise<NestExpressApplication> | undefined;

  const instance = () => {
    if (pending) return pending;

    pending = (async () => {
      const app = await NestFactory.create<NestExpressApplication>(
        module,
        new ExpressAdapter(),
        opts,
      );

      await configure?.(app);
      await app.init();

      return app;
    })();

    return pending;
  };

  const handler = (async (request: Request) => {
    const app = await instance();
    const url = new URL(request.url);
    const hasBody = !["GET", "HEAD"].includes(request.method);

    const res = await inject(app.getHttpAdapter().getInstance(), {
      method: request.method,
      url: url.pathname + url.search,
      headers: Object.fromEntries(request.headers),
      payload: hasBody ? Buffer.from(await request.arrayBuffer()) : undefined,
    });

    const headers = new Headers();

    for (const [k, v] of Object.entries(res.headers)) {
      if (k === "content-length" || k === "transfer-encoding") continue;
      if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
      else if (v != null) headers.set(k, String(v));
    }

    return new Response(res.rawPayload, {
      status: res.statusCode,
      headers,
    });
  }) as Fetcher;

  handler.app = instance;

  handler.close = async () => {
    if (pending) await (await pending).close();
    pending = undefined;
  };

  return handler;
}
