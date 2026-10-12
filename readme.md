# `open-nest`

Turn a Nest application into a Web fetch handler. Pass a `Request`, get a `Response`, without calling `listen()`.

## Installation

```bash
bun add open-nest
```

Nest, `reflect-metadata`, `rxjs`, and your platform package are peer dependencies. An existing Nest app already has them. Import `open-nest/fastify` or `open-nest/express` to match the platform you use.

## Usage

```ts
import "reflect-metadata";
import { Controller, Get, Module } from "@nestjs/common";
import { createFetcher } from "open-nest/fastify";
import { AppModule } from "@/app.module";

const fetch = createFetcher({ module: AppModule });

await Bun.serve({
  fetch,
  port: 3000,
});
```

Express follows the same pattern, imported from `open-nest/express`.

The Nest app boots on the first request and its instance is cached for all further requests.

You can close the Nest app and clear the cache with `fetch.close()`.

```ts
await fetch.close();
```

#### Configure

`configure` runs after the app is created and before `init`. Use it for pipes, a global prefix, CORS, and the other app methods.

```ts
const fetch = createFetcher({
  module: AppModule,
  configure: (app) => {
    app.setGlobalPrefix("api");
  },
});
```

#### Nest options

`opts` is forwarded to `NestFactory.create` as `NestApplicationOptions`. When omitted, Nest keeps its own defaults.

```ts
const fetch = createFetcher({
  module: AppModule,
  opts: { logger: ["error", "warn"] },
});
```

## Lifecycle

#### Develop

```bash
bun dev
```

#### Test

```bash
bun test
```

#### Build

```bash
bun run build
```

#### Typecheck

```bash
bun typecheck
```

#### Lint / Format

```bash
bun lint
bun format
```
