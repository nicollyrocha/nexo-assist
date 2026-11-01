import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import type { Db } from "../repo";
import * as schema from "../schema";

/** Postgres em memória com as migrações reais aplicadas — testes sem depender do Neon. */
export async function createTestDb(): Promise<Db> {
  const db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../migrations", import.meta.url)) });
  return db as unknown as Db;
}
