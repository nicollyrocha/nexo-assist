import { defineConfig, devices } from "@playwright/test";

// E2E contra os dois serviços reais (web :3000 e tickets :3001), com os bancos e o modelo do .env.local.
// Chama o LLM de verdade: rode à mão (pnpm --filter @nexo/web e2e), não no `pnpm test`.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Um turno do agent inclui o modelo e o legado instável (retry). No plano gratuito, com a cota
  // por minuto apertada, a cadeia de reserva pode levar mais de um minuto: margem generosa.
  timeout: 300_000,
  expect: { timeout: 120_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: "pnpm --filter @nexo/tickets dev",
      url: "http://localhost:3001/api/health",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @nexo/web dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
