import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // PGlite com as migrações reais leva alguns segundos para subir.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
