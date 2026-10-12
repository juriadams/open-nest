import { defineConfig } from "tsdown";

export default defineConfig({
  dts: true,
  publint: true,
  attw: true,
  clean: false,
  tsconfig: "tsconfig.json",
  entry: {
    fetch: "src/fetch/index.ts",
    bun: "src/adapters/bun/index.ts",
    node: "src/adapters/node/index.ts",
    workers: "src/adapters/workers/index.ts",
  },
});
