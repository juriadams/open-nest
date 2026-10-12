import { defineConfig } from "tsdown";

export default defineConfig({
  dts: true,
  publint: true,
  attw: true,
  clean: false,
  tsconfig: "tsconfig.json",
  entry: {
    index: "src/fetch/index.ts",
  },
});
