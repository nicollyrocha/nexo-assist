import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type TicketsDb = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Cliente do Neon via HTTP — adequado às funções serverless da Vercel. Use a URL pooled. */
export function createTicketsDb(url: string): TicketsDb {
  return drizzle({ client: neon(url), schema }) as unknown as TicketsDb;
}
