# `open-nest`

[![Workers](https://img.shields.io/badge/WORKERS-000000?style=for-the-badge&logo=cloudflareworkers&logoColor=white)](https://workers.cloudflare.com)
[![Bun](https://img.shields.io/badge/BUN-000000?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
[![Node](https://img.shields.io/badge/NODE-000000?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)<br>
[![Validate](https://github.com/juriadams/open-nest/actions/workflows/validate.yml/badge.svg)](https://github.com/juriadams/open-nest/actions/workflows/validate.yml)
[![npm version](https://img.shields.io/npm/v/open-nest)](https://www.npmjs.com/package/open-nest)
[![bundle size](https://img.shields.io/bundlejs/size/open-nest)](https://bundlejs.com/?q=open-nest)

---

**open-nest** (`open-nest`) runs a Nest application as a Web-standard `Request`/`Response` handler.

The same Nest module serves HTTP on Bun, Node, and Cloudflare Workers. Each runtime is its own package. The handler is created once and reused for every request.

### Features:

- **One handler**  
  `createFetcher` turns a Nest module into `(request) => Response`.

- **Bun, Node, and Workers**  
  `@open-nest/bun` uses `Bun.serve`. `@open-nest/node` uses `node:http`. `@open-nest/workers` creates a Worker `fetch` handler.

- **WebSockets**  
  `BunWsAdapter` lets `Bun.serve` upgrade the connection. `NodeWsAdapter` upgrades through [`ws`](https://github.com/websockets/ws).

- **Static files**  
  `BunAdapter` reads files with `Bun.file()`. `NodeAdapter` reads them with `node:fs`.

- **Worker bindings**  
  `workerContext()` returns `env` and `ctx` for the request in flight, including `ctx.waitUntil`.

## Contents

- [Installation](#installation)  
  Add `open-nest` and a runtime package.

- [Usage](#usage)  
  Create a handler and serve it.

- [Examples](#examples)  
  Small apps for each runtime.

  - [Bun](#bun)
  - [Node](#node)
  - [Workers](#workers)

- [Packages](#packages)  
  What each package is for.

## Installation

Peer dependencies are `@nestjs/common`, `@nestjs/core`, `reflect-metadata`, and `rxjs`. WebSocket gateways also need `@nestjs/websockets`. These already ship with a Nest installation.

```sh
bun add open-nest
```

Add the runtime you serve with:

```sh
bun add @open-nest/bun
bun add @open-nest/node
bun add @open-nest/workers
```

## Usage

```ts
import "reflect-metadata";

import { createFetcher } from "open-nest";

import { AppModule } from "@/app/module";

// 1. Create a handler from a Nest module.
const fetcher = createFetcher({ module: AppModule });

// 2. Serve it anywhere that speaks Request and Response.
await Bun.serve({
  fetch: fetcher,
  port: 3000,
});
```

`createFetcher` initializes the Nest application once and returns a function from `Request` to `Response`.

`configure` runs after the app is created and before `init`. `opts` is forwarded to `NestFactory.create`. `app()` resolves the Nest application.

```ts
const fetcher = createFetcher({
  module: AppModule,
  configure: (app) => {
    app.enableCors();
    app.setGlobalPrefix("api");
  },
  opts: { logger: ["error", "warn"] },
});

const app = await fetcher.app();
```

### Bun

```ts
import { BunWsAdapter, createBunServer } from "@open-nest/bun";

await createBunServer({
  module: AppModule,
  port: 3000,
  configure: (app) => {
    app.useWebSocketAdapter(new BunWsAdapter());
    app.useStaticAssets("public", { prefix: "/static" });
  },
});
```

`createBunServer` starts `Bun.serve` and returns it. `BunWsAdapter` records gateway paths so `Bun.serve` can upgrade them. Static files are served with `Bun.file()`.

### Node

```ts
import { createNodeServer, NodeWsAdapter } from "@open-nest/node";

await createNodeServer({
  module: AppModule,
  port: 3000,
  configure: (app) => {
    app.useWebSocketAdapter(new NodeWsAdapter());
    app.useStaticAssets("public", { prefix: "/static" });
  },
});
```

`createNodeServer` starts an `http.Server` and returns it. Gateway upgrades go through `ws`. The WebSocket client is the global `WebSocket` from Node 22 onward. Static files are served with `node:fs`.

### Workers

```ts
import {
  createWorkerFetcher,
  workerContext,
  type WorkerExecutionContext,
} from "@open-nest/workers";

interface Env {
  APP_NAME: string;
  CACHE: KVNamespace;
}

const fetcher = createWorkerFetcher<Env>({ module: AppModule });

export default {
  fetch: (request: Request, env: Env, ctx: WorkerExecutionContext) =>
    fetcher(request, env, ctx),
};

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
```

`createWorkerFetcher` returns a handler of `(request, env, ctx)`. `workerContext()` reads those bindings for the request in flight. The Worker needs the `nodejs_compat` compatibility flag.

## Examples

- [`examples/bun`](/examples/bun)  
  <sup>[readme](/examples/bun/readme.md) ⋅ [code](/examples/bun/)</sup>  
  Nest on `Bun.serve`. `GET /health` returns `{ data: null, error: null }`.

- [`examples/bun-websockets`](/examples/bun-websockets)  
  <sup>[readme](/examples/bun-websockets/readme.md) ⋅ [code](/examples/bun-websockets/)</sup>  
  A gateway at `/ws` that echoes `events`.

- [`examples/node`](/examples/node)  
  <sup>[readme](/examples/node/readme.md) ⋅ [code](/examples/node/)</sup>  
  Nest on `http.Server`. `GET /` returns `{ data: null, error: null }`.

- [`examples/node-websockets`](/examples/node-websockets)  
  <sup>[readme](/examples/node-websockets/readme.md) ⋅ [code](/examples/node-websockets/)</sup>  
  The same gateway, upgraded through `ws`.

- [`examples/workers`](/examples/workers)  
  <sup>[readme](/examples/workers/readme.md) ⋅ [code](/examples/workers/)</sup>  
  A Worker with an `APP_NAME` variable and a `CACHE` KV binding.

From the repository root, `bun run dev` watches the packages and starts every example. Bun listens on port 4001, Bun websockets on 4002, Node on 4003, Node websockets on 4004, and Workers on 8787.

## Packages

- [`open-nest`](/packages/open-nest)  
  <sup>[readme](/packages/open-nest/readme.md)</sup>  
  The HTTP handler: `createFetcher`, `FetchAdapter`, and multipart interceptors.

- [`@open-nest/bun`](/packages/@open-nest/bun)  
  <sup>[readme](/packages/@open-nest/bun/readme.md) ⋅ [examples](/examples/bun)</sup>  
  `Bun.serve`, WebSocket upgrades, and static files.

- [`@open-nest/node`](/packages/@open-nest/node)  
  <sup>[readme](/packages/@open-nest/node/readme.md) ⋅ [examples](/examples/node)</sup>  
  `node:http`, WebSocket upgrades through `ws`, and static files.

- [`@open-nest/workers`](/packages/@open-nest/workers)  
  <sup>[readme](/packages/@open-nest/workers/readme.md) ⋅ [examples](/examples/workers)</sup>  
  Worker `fetch`, plus `env` and `ctx` for the request in flight.
