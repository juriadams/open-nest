import { defineConfig } from "tsdown";

export default defineConfig({
  dts: true,
  publint: true,
  attw: true,
  clean: false,
  tsconfig: "tsconfig.json",
  entry: {
    fastify: "src/adapters/fastify/index.ts",
    express: "src/adapters/express/index.ts",
  },
});
