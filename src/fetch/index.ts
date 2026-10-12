import {
  BadRequestException,
  PayloadTooLargeException,
  RequestMethod,
  StreamableFile,
  type INestApplication,
  type NestApplicationOptions,
  type Type,
  type VersioningOptions,
} from "@nestjs/common";
import type { VersionValue } from "@nestjs/common/interfaces/version-options.interface";
import { AbstractHttpAdapter, NestFactory } from "@nestjs/core";
import {
  asHttpException,
  ExpressRequest,
  ExpressResponse,
} from "@/lib/express";
import { FetchSocket, type FetchRequest } from "@/lib/request";
import { FetchResponse } from "@/lib/response";
import { Router } from "@/lib/router";
import { applyVersionFilter as filterByVersion } from "@/lib/version";

const BODY_LIMIT = 1024 * 1024;

export interface CorsOptions {
  origin?:
    | boolean
    | string
    | RegExp
    | Array<string | RegExp>
    | ((origin: string) => boolean);
  methods?: string | string[];
  allowedHeaders?: string | string[];
  exposedHeaders?: string | string[];
  credentials?: boolean;
  maxAge?: number;
}

/**
 * Options for {@link createFetcher}.
 */
export interface CreateHandlerOptions {
  /**
   * Root Nest module.
   */
  module: Type<unknown>;

  /**
   * Runs after the app is created and before init.
   */
  configure?: (app: INestApplication) => void | Promise<void>;

  /**
   * Forwarded to `NestFactory.create`.
   */
  opts?: NestApplicationOptions;

  /**
   * Max JSON or urlencoded body size in bytes. Defaults to 1 MiB.
   */
  bodyLimit?: number;
}

export interface Fetcher {
  (request: Request): Promise<Response>;

  /**
   * Resolves the underlying Nest app instance.
   */
  app(): Promise<INestApplication>;

  /**
   * Closes the underlying Nest app.
   */
  close(): Promise<void>;
}

export class FetchAdapter extends AbstractHttpAdapter<
  undefined,
  FetchRequest,
  FetchResponse
> {
  private bodyLimit = BODY_LIMIT;
  private rawBody = false;
  private shuttingDown = false;
  private parsersReady = false;

  constructor() {
    super(new Router());
  }

  protected get router(): Router {
    return this.getInstance();
  }

  handle(input: Request): Promise<Response> {
    if (this.shuttingDown) {
      return Promise.resolve(
        new Response("Service Unavailable", {
          status: 503,
          headers: { connection: "close" },
        }),
      );
    }

    const socket = new FetchSocket();
    const req = new ExpressRequest(input, socket);
    const res = new ExpressResponse(socket, req);

    const onAbort = () => {
      socket.close();

      queueMicrotask(() => {
        if (!res.headersSent) res.end();
      });
    };

    if (input.signal.aborted) onAbort();
    else input.signal.addEventListener("abort", onAbort, { once: true });

    this.router.handle(req, res);

    return res.ready();
  }

  listen(): never {
    throw new Error(
      "FetchAdapter does not listen. Pass createFetcher() to the runtime fetch handler.",
    );
  }

  initHttpServer(options: NestApplicationOptions): void {
    this.rawBody = options.rawBody === true;

    if (options.return503OnClosing) {
      this.router.use((req, res, next) => {
        if (!this.shuttingDown) return next();

        res.status(503).send("Service Unavailable");
      });
    }
  }

  beforeClose(): void {
    this.shuttingDown = true;
  }

  close(): void {}

  useStaticAssets(
    _root?: string,
    _options?: { prefix?: string; index?: string | false },
  ): this {
    return this;
  }

  setViewEngine(): this {
    return this;
  }

  getRequestHostname(request: FetchRequest): string {
    return request.hostname;
  }

  getRequestMethod(request: FetchRequest): string {
    return request.method;
  }

  getRequestUrl(request: FetchRequest): string {
    return request.originalUrl;
  }

  status(response: FetchResponse, statusCode: number): FetchResponse {
    return response.status(statusCode);
  }

  reply(response: FetchResponse, body: unknown, statusCode?: number): void {
    if (statusCode != null) response.status(statusCode);

    if (body == null) {
      response.end();

      return;
    }

    if (body instanceof StreamableFile) {
      const headers = body.getHeaders();

      if (!response.getHeader("content-type")) {
        response.setHeader("content-type", headers.type);
      }

      if (headers.disposition && !response.getHeader("content-disposition")) {
        const disposition = Array.isArray(headers.disposition)
          ? headers.disposition.join("; ")
          : headers.disposition;

        response.setHeader("content-disposition", disposition);
      }

      if (headers.length != null && !response.getHeader("content-length")) {
        response.setHeader("content-length", String(headers.length));
      }

      const stream = body.getStream();

      stream.once("error", (err: Error) => {
        if (!response.headersSent) body.errorHandler(err, response);
        else body.errorLogger(err);
      });

      response.once("close", () => {
        if (!stream.readableEnded) stream.destroy();
      });

      stream.pipe(response as unknown as NodeJS.WritableStream);

      return;
    }

    if (typeof body === "object") {
      response.json(body);

      return;
    }

    const text =
      typeof body === "string"
        ? body
        : typeof body === "number" ||
            typeof body === "boolean" ||
            typeof body === "bigint"
          ? String(body)
          : "";

    response.send(text);
  }

  end(response: FetchResponse, message?: string): void {
    response.end(message);
  }

  render(): never {
    throw new Error("FetchAdapter has no view engine.");
  }

  redirect(response: FetchResponse, statusCode: number, url: string): void {
    response.status(statusCode);
    response.setHeader("location", url);
    response.end();
  }

  isHeadersSent(response: FetchResponse): boolean {
    return response.headersSent;
  }

  getHeader(response: FetchResponse, name: string): string | null {
    return response.getHeader(name);
  }

  setHeader(response: FetchResponse, name: string, value: string): void {
    response.setHeader(name, value);
  }

  appendHeader(response: FetchResponse, name: string, value: string): void {
    response.appendHeader(name, value);
  }

  setErrorHandler(handler: Function): void {
    this.router.use(function (
      err: unknown,
      req: FetchRequest,
      res: FetchResponse,
      next: (error?: unknown) => void,
    ) {
      return handler(asHttpException(err), req, res, next);
    });
  }

  setNotFoundHandler(handler: Function): void {
    this.router.use((req, res, next) => handler(req, res, next));
  }

  getType(): string {
    return "fetch";
  }

  isRouteOrderSensitive(): boolean {
    return true;
  }

  applyVersionFilter(
    handler: Function,
    version: VersionValue,
    versioningOptions: VersioningOptions,
  ): (req: FetchRequest, res: FetchResponse, next: () => void) => Function {
    return filterByVersion(
      handler as (
        req: FetchRequest,
        res: FetchResponse,
        next: () => void,
      ) => unknown,
      version,
      versioningOptions,
    ) as (req: FetchRequest, res: FetchResponse, next: () => void) => Function;
  }

  createMiddlewareFactory(method: RequestMethod) {
    return (path: string, callback: Function) => {
      const exact = path.endsWith("$");
      const verb = method === RequestMethod.ALL ? null : RequestMethod[method];

      this.router.add(
        verb,
        exact ? path.slice(0, -1) : path,
        callback as (
          req: FetchRequest,
          res: FetchResponse,
          next: (err?: unknown) => void,
        ) => unknown,
        exact ? "exact" : "prefix",
      );
    };
  }

  registerParserMiddleware(): void {
    if (this.parsersReady) return;

    this.parsersReady = true;

    this.router.use(async (req, res, next) => {
      if (
        req._body ||
        req.method === "GET" ||
        req.method === "HEAD" ||
        !req.raw.body
      ) {
        return next();
      }

      const type =
        req.raw.headers
          .get("content-type")
          ?.split(";")[0]
          ?.trim()
          .toLowerCase() ?? "";

      if (type.startsWith("multipart/")) return next();

      const json = type === "application/json" || type.endsWith("+json");
      const urlencoded = type === "application/x-www-form-urlencoded";

      if (!json && !urlencoded) {
        req.body = req.raw.body;

        return next();
      }

      if (!(req instanceof ExpressRequest)) return next();

      let bytes: Uint8Array;

      try {
        bytes = await readLimited(req, this.bodyLimit);
      } catch (error) {
        return next(error);
      }

      if (this.rawBody) req.rawBody = bytes;

      const text = new TextDecoder().decode(bytes);

      if (urlencoded) {
        const params = new URLSearchParams(text);
        const body: Record<string, string | string[]> = {};

        for (const key of new Set(params.keys())) {
          const all = params.getAll(key);
          const first = all[0];

          if (first == null) continue;

          body[key] = all.length > 1 ? all : first;
        }

        req.body = body;
        req._body = true;

        return next();
      }

      try {
        req.body = text ? JSON.parse(text) : {};
      } catch {
        return next(new BadRequestException("Invalid JSON"));
      }

      req._body = true;
      next();
    });
  }

  enableCors(options?: CorsOptions): void {
    this.router.use((req, res, next) => {
      const origin = headerString(req.headers.origin);
      const allowed = allowedOrigin(
        origin,
        options?.origin,
        options?.credentials === true,
      );

      if (allowed) {
        res.setHeader("access-control-allow-origin", allowed);

        if (options?.credentials) {
          res.setHeader("access-control-allow-credentials", "true");
        }

        if (allowed !== "*") res.appendHeader("vary", "Origin");
      }

      const methods = options?.methods ?? "GET,HEAD,PUT,PATCH,POST,DELETE";
      const requestHeaders = headerString(
        req.headers["access-control-request-headers"],
      );
      const allowHeaders = options?.allowedHeaders ?? requestHeaders ?? "";

      res.setHeader(
        "access-control-allow-methods",
        Array.isArray(methods) ? methods.join(",") : methods,
      );

      if (allowHeaders) {
        res.setHeader(
          "access-control-allow-headers",
          Array.isArray(allowHeaders) ? allowHeaders.join(",") : allowHeaders,
        );
      }

      if (options?.exposedHeaders) {
        const exposed = options.exposedHeaders;

        res.setHeader(
          "access-control-expose-headers",
          Array.isArray(exposed) ? exposed.join(",") : exposed,
        );
      }

      if (options?.maxAge != null) {
        res.setHeader("access-control-max-age", String(options.maxAge));
      }

      if (
        req.method === "OPTIONS" &&
        req.headers["access-control-request-method"]
      ) {
        res.status(204).end();

        return;
      }

      next();
    });
  }

  setBodyLimit(limit: number): void {
    this.bodyLimit = limit;
  }
}

function headerString(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function allowedOrigin(
  origin: string | undefined,
  rule: CorsOptions["origin"],
  credentials: boolean,
): string | undefined {
  const fallback = credentials ? origin : "*";

  if (rule == null || rule === true || rule === "*") return fallback;

  if (rule === false || !origin) return undefined;

  if (rule instanceof RegExp) return rule.test(origin) ? origin : undefined;

  if (typeof rule === "string") return rule === origin ? origin : undefined;

  if (Array.isArray(rule)) {
    const matched = rule.some((item) =>
      item instanceof RegExp ? item.test(origin) : item === origin,
    );

    return matched ? origin : undefined;
  }

  return rule(origin) ? origin : undefined;
}

function readLimited(req: ExpressRequest, limit: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) return;

      settled = true;
      req.destroy();
      reject(error);
    };

    req.on("data", (chunk: Buffer) => {
      total += chunk.byteLength;

      if (total > limit) {
        fail(new PayloadTooLargeException());

        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => {
      if (settled) return;

      settled = true;

      const bytes = new Uint8Array(total);
      let offset = 0;

      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }

      resolve(bytes);
    });

    req.on("error", (error) => {
      if (settled) return;

      settled = true;
      reject(error);
    });

    req.resume();
  });
}

export function createFetcher(
  { module, configure, opts, bodyLimit }: CreateHandlerOptions,
  adapter: FetchAdapter = new FetchAdapter(),
): Fetcher {
  if (bodyLimit != null) adapter.setBodyLimit(bodyLimit);

  let pending: Promise<INestApplication> | undefined;

  const instance = () => {
    if (pending) return pending;

    pending = (async () => {
      const app = await NestFactory.create(module, adapter, opts);

      await configure?.(app);
      await app.init();

      return app;
    })();

    return pending;
  };

  const handler = (async (request: Request) => {
    await instance();

    return adapter.handle(request);
  }) as Fetcher;

  handler.app = instance;

  handler.close = async () => {
    if (pending) await (await pending).close();

    pending = undefined;
  };

  return handler;
}

export {
  AnyFilesInterceptor,
  FileInterceptor,
  FilesInterceptor,
  type MultipartLimits,
  type MultipartOptions,
} from "@/lib/multipart";
