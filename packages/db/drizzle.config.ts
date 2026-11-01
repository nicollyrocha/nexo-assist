import { defineConfig } from "drizzle-kit";

// Migrações usam a conexão direta (não pooled) do Neon.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? "" },
});
