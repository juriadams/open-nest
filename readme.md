# `open-nest`

[![Workers](https://img.shields.io/badge/WORKERS-000000?style=for-the-badge&logo=cloudflareworkers&logoColor=white)](https://workers.cloudflare.com)
[![Bun](https://img.shields.io/badge/BUN-000000?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
[![Node](https://img.shields.io/badge/NODE-000000?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)<br>
[![Validate](https://github.com/juriadams/open-nest/actions/workflows/validate.yml/badge.svg)](https://github.com/juriadams/open-nest/actions/workflows/validate.yml)
[![npm version](https://img.shields.io/npm/v/open-nest)](https://www.npmjs.com/package/open-nest)
[![bundle size](https://img.shields.io/bundlejs/size/open-nest)](https://bundlejs.com/?q=open-nest)

Run any Nest application as a Web-Standard `Request`/`Response` handler. First class support for **Bun**, **Node**, and **Cloudflare Workers**.

## Installation

```bash
bun add open-nest
```

Peer dependencies are `@nestjs/common`, `@nestjs/core`, `reflect-metadata`, and `rxjs`. WebSocket gateways also need `@nestjs/websockets`. These should already ship with your Nest installation.

## Examples

- [`examples/workers`](/examples/workers)<br />
  <sup>[readme](/examples/workers/readme.md) ⋅ [code](/examples/workers/)</sup><br />
  Run a Nest application on Cloudflare Workers.

- [`examples/bun`](/examples/bun)<br />
  <sup>[readme](/examples/bun/readme.md) ⋅ [code](/examples/bun/)</sup><br />
  Run a Nest application via `Bun.serve`.

- [`examples/bun-websockets`](/examples/bun-websockets)<br />
  <sup>[readme](/examples/bun-websockets/readme.md) ⋅ [code](/examples/bun-websockets/)</sup><br />
  Run a Nest application via `Bun.serve` with WebSockets.

- [`examples/node`](/examples/node)<br />
  <sup>[readme](/examples/node/readme.md) ⋅ [code](/examples/node/)</sup><br />
  Run a Nest application via `http.Server`.

- [`examples/node-websockets`](/examples/node-websockets)<br />
  <sup>[readme](/examples/node-websockets/readme.md) ⋅ [code](/examples/node-websockets/)</sup><br />
  Run a Nest application via `http.Server` with WebSockets.

## Usage

```ts
import "reflect-metadata";

import { createFetcher } from "open-nest";
import { AppModule } from "@/app/module";

const fetcher = createFetcher({ module: AppModule });

await Bun.serve({
  fetch: fetcher,
  port: 3000,
});
```

`createFetcher` from `open-nest` is the HTTP entry. It returns a function from `Request` to `Response`. WebSocket gateways and static files are available for the respective runtime under `open-nest/bun` and `open-nest/node`.

### Bun

```ts
import "reflect-metadata";

import { BunWsAdapter, createBunServer } from "open-nest/bun";
import { AppModule } from "@/app/module";

await createBunServer({
  module: AppModule,
  port: 3000,
  configure: (app) => {
    app.useWebSocketAdapter(new BunWsAdapter());
    app.useStaticAssets("public", { prefix: "/static" });
  },
});
```

`createBunServer` from `open-nest/bun` serves that handler with `Bun.serve`. It upgrades gateway paths and serves files with `Bun.file()`.

- `createBunServer` initializes the Nest application once and starts and returns a `Bun.serve` instance.
- `BunWsAdapter` is the Nest WebSocket adapter. `Bun.serve` performs the upgrade.
- `BunAdapter` extends `FetchAdapter` and implements `useStaticAssets` with `Bun.file()`.

### Node

```ts
import "reflect-metadata";

import { createNodeServer, NodeWsAdapter } from "open-nest/node";
import { AppModule } from "@/app/module";

await createNodeServer({
  module: AppModule,
  port: 3000,
  configure: (app) => {
    app.useWebSocketAdapter(new NodeWsAdapter());
    app.useStaticAssets("public", { prefix: "/static" });
  },
});
```

`createNodeServer` from `open-nest/node` initializes the Nest application and starts and returns a `http.Server` instance. HTTP uses `node:http`, `node:stream`, and `node:fs` (`openAsBlob`).

Gateway upgrades go through [`ws`](https://github.com/websockets/ws). The WebSocket client is the global `WebSocket` from Node 22 onward.

- `createNodeServer` initializes the Nest application once and starts and returns a `http.Server` instance.
- `NodeWsAdapter` is the Nest WebSocket adapter. Upgrades go through `ws`.
- `NodeAdapter` extends `FetchAdapter` and implements `useStaticAssets` with `node:fs`.

### Workers

```ts
import "reflect-metadata";

import {
  createWorkerFetcher,
  workerContext,
  type WorkerExecutionContext,
} from "open-nest/workers";

interface Env {
  APP_NAME: string;
  CACHE: KVNamespace;
}

@Controller()
class AppController {
  @Get()
  async index() {
    const { env, ctx } = workerContext<Env>();
    const lastOpenedAt = await env.CACHE.get("last-opened-at");

    ctx.waitUntil(env.CACHE.put("last-opened-at", new Date().toISOString()));

    return { data: { app: env.APP_NAME, lastOpenedAt }, error: null };
  }
}

@Module({ controllers: [AppController] })
class AppModule {}

const fetcher = createWorkerFetcher<Env>({ module: AppModule });

export default {
  fetch: (request: Request, env: Env, ctx: WorkerExecutionContext) =>
    fetcher(request, env, ctx),
};
```

`createWorkerFetcher` from `open-nest/workers` initializes the Nest application and returns a handler of `(request, env, ctx)`.

Pass bindings and the execution context through, then read them with `workerContext()` from a controller or provider. The Worker needs the `nodejs_compat` compatibility flag.

- `createWorkerFetcher` initializes the Nest application once and returns a handler of `(request, env, ctx)`.
- `workerContext()` reads the bindings and the raw execution context for the request in flight.
- `WorkerExecutionContext` is the `ctx` argument: `waitUntil`, `passThroughOnException`, and `props`.

### App Configuration

```ts
const fetcher = createFetcher({
  module: AppModule,
  configure: (app) => {
    app.enableCors();
    app.setGlobalPrefix("api");
  },
});
```

`configure` runs after the app is created and before `init`. Use it for pipes, a global prefix, CORS, and the other app methods.

### App Instance

```ts
const app = await fetcher.app();
```

`app()` resolves the underlying Nest application.

#### Nest Options

```ts
const fetcher = createFetcher({
  module: AppModule,
  opts: { logger: ["error", "warn"] },
});
```

`opts` is forwarded to `NestFactory.create` as `NestApplicationOptions`. When omitted, Nest keeps its own defaults.
