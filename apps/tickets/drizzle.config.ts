import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// Migrações usam a conexão direta (não pooled) do Neon.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.TICKETS_DATABASE_URL_UNPOOLED ?? "" },
});
