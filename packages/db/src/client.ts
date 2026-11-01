import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { Db } from "./repo";
import * as schema from "./schema";

/** Cliente do Neon via HTTP — adequado às funções serverless da Vercel. Use a URL pooled. */
export function createDb(url: string): Db {
  return drizzle({ client: neon(url), schema }) as unknown as Db;
}
