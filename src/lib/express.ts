import { Readable } from "node:stream";
import { HttpException } from "@nestjs/common";
import {
  createRequest,
  type FetchRequest,
  type FetchSocket,
} from "@/lib/request";
import { FetchResponse } from "@/lib/response";

export class ExpressRequest extends Readable implements FetchRequest {
  readonly raw: Request;
  readonly method: string;
  readonly originalUrl: string;
  readonly headers: Record<string, string | string[]>;
  readonly query: Record<string, string | string[]>;
  params: Record<string, string>;
  body: unknown;
  _body?: boolean;
  rawBody?: Uint8Array;
  readonly ip: string;
  readonly hostname: string;
  readonly socket: FetchSocket;
  file?: FetchRequest["file"];
  files?: FetchRequest["files"];

  private urlValue: string;
  private started = false;
  private resumeRead: (() => void) | undefined;

  constructor(input: Request, socket: FetchSocket) {
    super();

    const base = createRequest(input, socket);

    this.raw = base.raw;
    this.method = base.method;
    this.originalUrl = base.originalUrl;
    this.headers = base.headers;
    this.query = base.query;
    this.params = base.params;
    this.body = base.body;
    this.ip = base.ip;
    this.hostname = base.hostname;
    this.socket = base.socket;
    this.urlValue = base.url;

    // body-parser and multer ignore a request that has neither Content-Length
    // nor Transfer-Encoding. A Web `Request` body is a stream of unknown length.
    if (
      input.body &&
      this.headers["content-length"] == null &&
      this.headers["transfer-encoding"] == null
    ) {
      this.headers["transfer-encoding"] = "chunked";
    }

    // body-parser 2 treats a finished request as already parsed. `_body` is the
    // flag pp-api sets so a later `json()` leaves the stream for the handler.
    this.on("end", () => {
      this._body = true;
    });
  }

  get finished(): boolean {
    return this._body === true;
  }

  get url(): string {
    return this.urlValue;
  }

  set url(value: string) {
    this.urlValue = value;
  }

  get path(): string {
    const query = this.urlValue.indexOf("?");
    const pathname =
      query === -1 ? this.urlValue : this.urlValue.slice(0, query);

    return pathname || "/";
  }

  get(name: string): string | undefined {
    const value = this.headers[name.toLowerCase()];

    if (Array.isArray(value)) return value[0];

    return value;
  }

  header(name: string): string | undefined {
    return this.get(name);
  }

  override _read(): void {
    if (!this.started) {
      this.started = true;
      void this.drain();

      return;
    }

    this.resumeRead?.();
    this.resumeRead = undefined;
  }

  private async drain(): Promise<void> {
    const body = this.raw.body;

    if (!body) {
      this.push(null);

      return;
    }

    const reader = body.getReader();

    try {
      for (;;) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = Buffer.from(value);

        if (!this.push(chunk)) {
          await new Promise<void>((resolve) => {
            this.resumeRead = resolve;
          });
        }
      }

      this.push(null);
    } catch (error) {
      this.destroy(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class ExpressResponse extends FetchResponse {
  readonly req: ExpressRequest;

  constructor(socket: FetchSocket, req: ExpressRequest) {
    super(socket);
    this.req = req;
  }

  override send(body?: unknown): void {
    if (body == null || body === "") {
      this.end();

      return;
    }

    if (typeof body === "string") {
      if (!this.getHeader("content-type")) {
        this.setHeader("content-type", "text/html; charset=utf-8");
      }

      this.end(body);

      return;
    }

    if (body instanceof Uint8Array) {
      if (!this.getHeader("content-type")) {
        this.setHeader("content-type", "application/octet-stream");
      }

      this.end(body);

      return;
    }

    this.json(body);
  }

  set(
    field: string | Record<string, string | number | readonly string[]>,
    value?: string | number | readonly string[],
  ): this {
    if (typeof field === "string") {
      this.writeHeader(field, value ?? "");

      return this;
    }

    for (const [name, item] of Object.entries(field))
      this.writeHeader(name, item);

    return this;
  }

  redirect(statusOrUrl: number | string, url?: string): void {
    const status = typeof statusOrUrl === "number" ? statusOrUrl : 302;
    const location =
      typeof statusOrUrl === "string" ? statusOrUrl : (url ?? "/");

    this.status(status);
    this.setHeader("location", location);
    this.end();
  }

  private writeHeader(
    name: string,
    value: string | number | readonly string[],
  ): void {
    if (Array.isArray(value)) {
      for (const item of value) this.appendHeader(name, String(item));

      return;
    }

    this.setHeader(name, String(value));
  }
}

export function errorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;

  const record = err as { status?: unknown; statusCode?: unknown };

  if (typeof record.status === "number") return record.status;

  if (typeof record.statusCode === "number") return record.statusCode;

  return undefined;
}

export function asHttpException(err: unknown): unknown {
  if (err instanceof HttpException) return err;

  const status = errorStatus(err);

  if (status == null) return err;

  const message =
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof err.message === "string"
      ? err.message
      : "Error";

  return new HttpException(message, status);
}

export function mountedUrl(url: string, mount: string): string {
  const query = url.indexOf("?");
  const pathname = query === -1 ? url : url.slice(0, query);
  const search = query === -1 ? "" : url.slice(query);
  let rest = pathname.slice(mount.length);

  if (!rest) rest = "/";
  else if (!rest.startsWith("/")) rest = `/${rest}`;

  return rest + search;
}
