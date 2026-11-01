import type { TicketsDb } from "./client";
import { buildSeed } from "./seed-data";
import * as schema from "./schema";

/** Recria os dados de exemplo. Apaga tudo antes: use só em banco de desenvolvimento/preview. */
export async function seed(db: TicketsDb, now = new Date()) {
  const data = buildSeed(now);
  await db.delete(schema.ticketEvents);
  await db.delete(schema.tickets);
  await db.delete(schema.helpArticles);
  await db.delete(schema.analysts);
  await db.delete(schema.employees);
  await db.insert(schema.employees).values(data.employees);
  await db.insert(schema.analysts).values(data.analysts);
  await db.insert(schema.tickets).values(data.tickets);
  await db.insert(schema.ticketEvents).values(data.events);
  await db.insert(schema.helpArticles).values(data.articles);
  return data;
}
