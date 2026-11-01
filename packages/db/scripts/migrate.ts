import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

// Usa o migrator do drizzle-orm em vez do drizzle-kit, que falha sem mostrar o motivo.
const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw new Error("Defina DATABASE_URL_UNPOOLED em apps/web/.env.local");

try {
  await migrate(drizzle({ client: neon(url) }), { migrationsFolder: "./migrations" });
  console.log("✓ migrações aplicadas");
} catch (error) {
  const cause = (error as { cause?: Error }).cause ?? (error as Error);
  console.error(`✗ migração falhou: ${cause.message}`);
  process.exitCode = 1;
}
