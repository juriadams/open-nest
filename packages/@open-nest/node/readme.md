# `@open-nest/node`

Serve an [`open-nest`](https://github.com/juriadams/open-nest) handler with `node:http`.

```sh
bun add @open-nest/node
```

`createNodeServer` starts an `http.Server`. `NodeWsAdapter` upgrades WebSocket gateways through `ws`. Static files use `node:fs`.

- [HTTP](../../../examples/node)
- [WebSockets](../../../examples/node-websockets)
