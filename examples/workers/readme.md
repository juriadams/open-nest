# Workers

A Worker with an `APP_NAME` variable and a `CACHE` KV binding. `GET /` reads the last open time and writes a new one with `ctx.waitUntil`.

```bash
bun run dev
```
