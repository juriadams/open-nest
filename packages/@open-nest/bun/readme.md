# `@open-nest/bun`

Serve an [`open-nest`](https://github.com/juriadams/open-nest) handler with `Bun.serve`.

```sh
bun add @open-nest/bun
```

`createBunServer` starts the server. `BunWsAdapter` upgrades WebSocket gateways. Static files use `Bun.file()`.

- [HTTP](../../../examples/bun)
- [WebSockets](../../../examples/bun-websockets)
