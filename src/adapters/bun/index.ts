import { sep, resolve } from "node:path";
import type {
  INestApplication,
  NestApplicationOptions,
  Type,
} from "@nestjs/common";
import { createFetcher, FetchAdapter, type Fetcher } from "@/fetch";
import { gatewayPath, WsGateway, type GatewayClient } from "@/lib/gateway";

const adapters: BunWsAdapter[] = [];

/**
 * Records Nest gateways during `init`. `Bun.serve` performs the upgrade.
 */
export class BunWsAdapter extends WsGateway<GatewayClient> {
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
 * Fetch adapter plus static files. Workers stay on {@link FetchAdapter}.
 */
export class BunAdapter extends FetchAdapter {
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

      const file = Bun.file(target);

      if (!(await file.exists())) return next();

      res.setHeader("content-type", file.type || "application/octet-stream");
      res.setHeader("content-length", String(file.size));

      if (req.method === "HEAD") {
        res.end();

        return;
      }

      res.end(new Uint8Array(await file.arrayBuffer()));
    });

    return this;
  }
}

export interface CreateBunServerOptions {
  /**
   * Root Nest module.
   */
  module: Type<unknown>;

  /**
   * Port passed to `Bun.serve`. `0` asks the OS for a free port.
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

export interface BunServer {
  port: number;
  fetch: Fetcher;
  close(): Promise<void>;
}

/**
 * Boots a Nest app and serves it with `Bun.serve`, including WebSocket upgrades.
 */
export async function createBunServer({
  module,
  port,
  configure,
  opts,
}: CreateBunServerOptions): Promise<BunServer> {
  const fallback = new BunWsAdapter();
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
    new BunAdapter(),
  );

  await fetcher.app();

  const active =
    [...adapters]
      .reverse()
      .find((adapter) => !seen.has(adapter) && adapter.hasGateways()) ??
    fallback;

  const server = Bun.serve({
    port: port ?? 3000,
    fetch: (request, bun) => {
      const pathname = new URL(request.url).pathname;

      if (
        active.matches(pathname) &&
        bun.upgrade(request, { data: { path: gatewayPath(pathname) } })
      ) {
        return undefined;
      }

      return fetcher(request);
    },
    websocket: {
      open: (client) => {
        active.open(client as GatewayClient);
      },
      message: (client, message) => {
        active.receive(client as GatewayClient, message);
      },
      close: (client) => {
        active.closed(client as GatewayClient);
      },
    },
  });

  return {
    port: server.port ?? port ?? 3000,
    fetch: fetcher,
    close: async () => {
      await server.stop(true);
      await fetcher.close();
    },
  };
}
