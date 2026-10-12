import { Emitter } from "@/lib/events";
import type { FetchSocket } from "@/lib/request";

export class FetchResponse extends Emitter {
  statusCode = 200;
  headersSent = false;
  writableEnded = false;
  destroyed = false;
  writable = true;
  readonly socket: FetchSocket;

  private readonly headers = new Headers();
  private controller!: ReadableStreamDefaultController<Uint8Array>;
  private wrote = false;
  private streamClosed = false;
  private readonly drainWaiters: Array<() => void> = [];
  private resolveReady!: (response: Response) => void;
  private readonly readyPromise: Promise<Response>;

  readonly stream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      this.controller = controller;
    },
    pull: () => {
      const waiters = this.drainWaiters.splice(0);

      for (const resume of waiters) resume();

      this.emit("drain");
    },
    cancel: () => {
      this.destroy();
    },
  });

  constructor(socket: FetchSocket) {
    super();
    this.socket = socket;
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  ready(): Promise<Response> {
    return this.readyPromise;
  }

  setHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  appendHeader(name: string, value: string): void {
    this.headers.append(name, value);
  }

  getHeader(name: string): string | null {
    return this.headers.get(name);
  }

  removeHeader(name: string): void {
    this.headers.delete(name);
  }

  getHeaders(): Record<string, string> {
    return Object.fromEntries(this.headers.entries());
  }

  status(code: number): this {
    this.statusCode = code;

    return this;
  }

  writeHead(
    status: number,
    headers?: Record<string, string | number | readonly string[]>,
  ): void {
    this.statusCode = status;

    if (headers) {
      for (const [name, value] of Object.entries(headers)) {
        if (Array.isArray(value)) {
          for (const item of value) this.headers.append(name, String(item));
        } else {
          this.headers.set(name, String(value));
        }
      }
    }

    this.commit();
  }

  flushHeaders(): void {
    this.commit();
  }

  write(
    chunk: unknown,
    encoding?: BufferEncoding | ((error?: Error | null) => void),
    cb?: (error?: Error | null) => void,
  ): boolean {
    if (typeof encoding === "function") {
      cb = encoding;
      encoding = undefined;
    }

    if (this.writableEnded) {
      cb?.();

      return false;
    }

    if (!this.headersSent) this.writeHead(this.statusCode);

    const bytes =
      chunk instanceof Uint8Array
        ? chunk
        : new TextEncoder().encode(
            typeof chunk === "string" ? chunk : String(chunk),
          );

    this.controller.enqueue(bytes);
    this.wrote = true;

    // Before a reader locks the stream, waiting on drain would deadlock.
    const blocked =
      this.stream.locked && (this.controller.desiredSize ?? 0) <= 0;

    if (!blocked) {
      cb?.();

      return true;
    }

    if (cb) this.drainWaiters.push(() => cb?.());

    return false;
  }

  end(
    chunk?: unknown,
    encoding?: BufferEncoding | (() => void),
    cb?: () => void,
  ): void {
    if (typeof chunk === "function") {
      cb = chunk as () => void;
      chunk = undefined;
    } else if (typeof encoding === "function") {
      cb = encoding;
      encoding = undefined;
    }

    if (this.writableEnded) {
      cb?.();

      return;
    }

    if (chunk != null) this.write(chunk, encoding);

    this.writableEnded = true;
    this.writable = false;

    if (!this.headersSent) this.commit();
    else if (this.wrote) this.closeStream();

    this.emit("finish");
    this.emit("close");
    cb?.();
  }

  private closeStream(): void {
    if (this.streamClosed) return;

    this.streamClosed = true;

    try {
      this.controller.close();
    } catch {
      // The consumer already cancelled the stream.
    }
  }

  send(body?: string): void {
    this.end(body);
  }

  json(body: unknown): void {
    if (!this.headers.has("content-type")) {
      this.setHeader("content-type", "application/json; charset=utf-8");
    }

    this.end(JSON.stringify(body));
  }

  destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;
    this.writable = false;
    this.socket.close();

    if (!this.headersSent) {
      this.headersSent = true;
      this.writableEnded = true;
      this.closeStream();
      this.resolveReady(new Response(null, { status: 499 }));
    }

    this.emit("close");
  }

  private commit(): void {
    if (this.headersSent) return;

    this.headersSent = true;

    const empty = this.writableEnded && !this.wrote;

    if (empty) this.closeStream();

    this.resolveReady(
      new Response(empty ? null : this.stream, {
        status: this.statusCode,
        headers: this.headers,
      }),
    );
  }
}
