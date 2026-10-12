# Workers

Worker with an `APP_NAME` variable and a `CACHE` KV binding. `GET /` reads the last open time and stores a new one with `ctx.waitUntil`.

```bash
bun run start
```
