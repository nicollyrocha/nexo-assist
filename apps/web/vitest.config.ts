import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    // Testes de servidor (.test.ts) rodam em node; os de componente (.test.tsx) declaram
    // `// @vitest-environment jsdom` no topo do arquivo.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test/setup.ts"],
    // PGlite com as migrações reais leva alguns segundos para subir.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
