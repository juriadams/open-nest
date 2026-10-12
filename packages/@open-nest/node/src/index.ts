import { openAsBlob } from "node:fs";
import { stat } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import type {
  INestApplication,
  NestApplicationOptions,
  Type,
} from "@nestjs/common";
import {
  createFetcher,
  FetchAdapter,
  gatewayPath,
  WsGateway,
  type Fetcher,
  type GatewayClient,
} from "open-nest";
import { WebSocketServer } from "ws";

interface NodeSocket extends GatewayClient {
  data: { path: string };
}

const adapters: NodeWsAdapter[] = [];

/**
 * Records Nest gateways during `init`. `node:http` performs the upgrade.
 */
export class NodeWsAdapter extends WsGateway<NodeSocket> {
  constructor() {
    super();
    adapters.push(this);
  }

  async dispose(): Promise<void> {
    const index = adapters.indexOf(this);

    if (index !== -1) adapters.splice(index, 1);
  }
}

/**
 * Fetch adapter plus static files via `node:fs`.
 */
export class NodeAdapter extends FetchAdapter {
  override useStaticAssets(
    root?: string,
    options?: { prefix?: string; index?: string | false },
  ): this {
    if (!root) return this;

    const prefix = options?.prefix ?? "/";
    const index = options?.index === undefined ? "index.html" : options.index;
    const rootResolved = resolve(root);

    this.router.use(prefix, async (req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();

      let relative: string;

      try {
        relative = decodeURIComponent(req.path);
      } catch {
        return next();
      }

      if (relative === "/") {
        if (index === false) return next();

        relative = index;
      } else {
        relative = relative.replace(/^\//, "");
      }

      const target = resolve(rootResolved, relative);

      if (target !== rootResolved && !target.startsWith(rootResolved + sep)) {
        return next();
      }

      let size: number;

      try {
        const info = await stat(target);

        if (!info.isFile()) return next();

        size = info.size;
      } catch {
        return next();
      }

      const type = contentType(target);
      const blob = await openAsBlob(target);

      res.setHeader("content-type", type);
      res.setHeader("content-length", String(size));

      if (req.method === "HEAD") {
        res.end();

        return;
      }

      const reader = blob.stream().getReader();

      for (;;) {
        const { done, value } = await reader.read();

        if (done) break;

        res.write(value);
      }

      res.end();
    });

    return this;
  }
}

function contentType(file: string): string {
  switch (extname(file).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".json":
      return "application/json";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".pdf":
      return "application/pdf";
    case ".wasm":
      return "application/wasm";
    default:
      return "application/octet-stream";
  }
}

export interface CreateNodeServerOptions {
  /**
   * Root Nest module.
   */
  module: Type<unknown>;

  /**
   * Port passed to `node:http`. `0` asks the OS for a free port.
   */
  port?: number;

  /**
   * Runs after the app is created and before init.
   */
  configure?: (app: INestApplication) => void | Promise<void>;

  /**
   * Forwarded to `NestFactory.create`.
   */
  opts?: NestApplicationOptions;
}

export interface NodeServer {
  port: number;
  fetch: Fetcher;
  close(): Promise<void>;
}

/**
 * Boots a Nest app and serves it with `node:http`, including WebSocket upgrades.
 */
export async function createNodeServer({
  module,
  port,
  configure,
  opts,
}: CreateNodeServerOptions): Promise<NodeServer> {
  const fallback = new NodeWsAdapter();
  const seen = new Set(adapters);
  const fetcher = createFetcher(
    {
      module,
      opts,
      configure: async (app) => {
        app.useWebSocketAdapter(fallback);
        await configure?.(app);
      },
    },
    new NodeAdapter(),
  );

  await fetcher.app();

  const active =
    [...adapters]
      .reverse()
      .find((adapter) => !seen.has(adapter) && adapter.hasGateways()) ??
    fallback;
  const sockets = new WebSocketServer({ noServer: true });

  const server = createServer((req, res) => {
    void writeFetch(fetcher, req, res);
  });

  server.on("upgrade", (req, socket, head) => {
    const pathname = gatewayPath(
      new URL(req.url ?? "/", "http://localhost").pathname,
    );

    if (!active.matches(pathname)) {
      socket.destroy();

      return;
    }

    sockets.handleUpgrade(req, socket, head, (ws) => {
      const client: NodeSocket = {
        data: { path: pathname },
        send(data) {
          ws.send(data);
        },
      };

      active.open(client);
      ws.on("message", (data) => {
        const raw =
          typeof data === "string"
            ? data
            : Array.isArray(data)
              ? Buffer.concat(data)
              : data instanceof ArrayBuffer
                ? new Uint8Array(data)
                : data;

        active.receive(client, raw);
      });
      ws.on("close", () => {
        active.closed(client);
      });
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(port ?? 3000, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  const chosen =
    typeof address === "object" && address ? address.port : (port ?? 3000);

  return {
    port: chosen,
    fetch: fetcher,
    close: async () => {
      for (const client of sockets.clients) client.terminate();

      await new Promise<void>((resolve, reject) => {
        sockets.close((error) => (error ? reject(error) : resolve()));
      });

      server.closeAllConnections();

      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await fetcher.close();
    },
  };
}

async function writeFetch(
  fetcher: Fetcher,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const response = await fetcher(toRequest(req));

    const headers = Object.fromEntries(response.headers.entries());

    res.writeHead(response.status, headers);

    if (!response.body) {
      res.end();

      return;
    }

    await new Promise<void>((resolve, reject) => {
      Readable.fromWeb(response.body!)
        .pipe(res)
        .on("finish", () => resolve())
        .on("error", reject);
    });
  } catch {
    if (!res.headersSent) res.writeHead(500);

    res.end();
  }
}

function toRequest(req: IncomingMessage): Request {
  const host = req.headers.host ?? "127.0.0.1";
  const url = new URL(req.url ?? "/", `http://${host}`);
  const headers = new Headers();

  for (const [name, value] of Object.entries(req.headers)) {
    if (value == null) continue;

    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else {
      headers.set(name, value);
    }
  }

  const method = req.method ?? "GET";
  const bodyless = method === "GET" || method === "HEAD";

  return new Request(url.href, {
    method,
    headers,
    body: bodyless ? undefined : Readable.toWeb(req),
    duplex: "half",
  } as RequestInit);
}
