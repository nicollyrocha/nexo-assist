import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// As variáveis do banco da aplicação ficam no .env.local do app web.
const envFile = "../../apps/web/.env.local";
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Migrações usam a conexão direta (não pooled) do Neon.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? "" },
});
