import { isOpenStatus, type HelpArticle, type Ticket } from "@nexo/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import type { TicketsDb } from "./client";
import * as schema from "./schema";

type TicketRow = typeof schema.tickets.$inferSelect;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    affected: row.affected,
    status: row.status,
    requesterId: row.requesterId,
    assignedTeam: row.assignedTeam,
    openedAt: row.openedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    dueAt: iso(row.dueAt),
    resolvedAt: iso(row.resolvedAt),
  };
}

// Privacidade (Anexo A): informações de um chamado só para quem o abriu.
// Toda leitura de chamado exige o requesterId; não existe busca de chamado só pelo código.

export async function listTicketsForRequester(
  db: TicketsDb,
  requesterId: string,
  opts: { openOnly?: boolean } = {},
): Promise<Ticket[]> {
  const rows = await db
    .select()
    .from(schema.tickets)
    .where(eq(schema.tickets.requesterId, requesterId))
    .orderBy(desc(schema.tickets.updatedAt));
  const tickets = rows.map(toTicket);
  return opts.openOnly ? tickets.filter((t) => isOpenStatus(t.status)) : tickets;
}

export async function getTicketForRequester(
  db: TicketsDb,
  requesterId: string,
  ticketId: string,
): Promise<Ticket | null> {
  const [row] = await db
    .select()
    .from(schema.tickets)
    .where(and(eq(schema.tickets.id, ticketId), eq(schema.tickets.requesterId, requesterId)));
  return row ? toTicket(row) : null;
}

export async function findEmployeeByEmail(db: TicketsDb, email: string) {
  const [row] = await db
    .select()
    .from(schema.employees)
    .where(eq(schema.employees.email, email.trim().toLowerCase()));
  return row ?? null;
}

export async function findAnalystByEmail(db: TicketsDb, email: string) {
  const [row] = await db
    .select()
    .from(schema.analysts)
    .where(eq(schema.analysts.email, email.trim().toLowerCase()));
  return row ?? null;
}

export async function getEmployeeById(db: TicketsDb, id: string) {
  const [row] = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
  return row ?? null;
}

export async function getAnalystById(db: TicketsDb, id: string) {
  const [row] = await db.select().from(schema.analysts).where(eq(schema.analysts.id, id));
  return row ?? null;
}

/** Palavras da busca viram um OR no full-text em português (com stemming): "senha bloqueada" acha "bloquear senha". */
const toOrQuery = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFC")
    .match(/[\p{L}\p{N}]{2,}/gu)
    ?.join(" | ") ?? "";

export async function searchHelpArticles(db: TicketsDb, text: string, limit = 3): Promise<HelpArticle[]> {
  const query = toOrQuery(text);
  if (!query) return [];
  const document = sql`to_tsvector('portuguese', ${schema.helpArticles.title} || ' ' || ${schema.helpArticles.body})`;
  const tsquery = sql`to_tsquery('portuguese', ${query})`;
  return db
    .select({
      id: schema.helpArticles.id,
      title: schema.helpArticles.title,
      body: schema.helpArticles.body,
      category: schema.helpArticles.category,
    })
    .from(schema.helpArticles)
    .where(sql`${document} @@ ${tsquery}`)
    .orderBy(sql`ts_rank(${document}, ${tsquery}) desc`)
    .limit(limit);
}
