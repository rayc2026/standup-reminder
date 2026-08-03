import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    main: "src/main/index.ts",
    preload: "src/main/preload.ts",
  },
  format: ["cjs"],
  target: "node20",
  platform: "node",
  clean: true,
  sourcemap: true,
  splitting: false,
  external: ["electron"],
  outDir: "dist-electron",
  outExtension: () => ({ js: ".cjs" }),
});
