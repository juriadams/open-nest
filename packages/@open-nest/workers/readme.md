# `@open-nest/workers`

Serve an [`open-nest`](https://github.com/juriadams/open-nest) handler on Cloudflare Workers.

```sh
bun add @open-nest/workers
```

`createWorkerFetcher` returns `(request, env, ctx)`. `workerContext()` reads those bindings for the request in flight. The Worker needs `nodejs_compat`.

- [KV bindings](../../../examples/workers)
