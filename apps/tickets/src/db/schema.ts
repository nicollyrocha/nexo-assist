import {
  AFFECTED,
  ANALYST_TIERS,
  CATEGORIES,
  PRIORITIES,
  TICKET_EVENT_KINDS,
  TICKET_STATUSES,
  TICKET_TYPES,
} from "@nexo/shared";
import { sql } from "drizzle-orm";
import { index, pgEnum, pgSequence, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Banco do serviço de chamados simulado (o "legado"). O agent nunca acessa direto:
// tudo passa pela API HTTP deste serviço.

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const ticketType = pgEnum("ticket_type", TICKET_TYPES);
export const category = pgEnum("category", CATEGORIES);
export const priority = pgEnum("priority", PRIORITIES);
export const affected = pgEnum("affected", AFFECTED);
export const ticketStatus = pgEnum("ticket_status", TICKET_STATUSES);
export const analystTier = pgEnum("analyst_tier", ANALYST_TIERS);
export const eventKind = pgEnum("ticket_event_kind", TICKET_EVENT_KINDS);
export const authorKind = pgEnum("author_kind", ["funcionario", "analista", "agent"]);

/** Numeração dos códigos INC-xxxxx e REQ-xxxxx, acima dos chamados de exemplo. */
export const incSequence = pgSequence("inc_seq", { startWith: 20600 });
export const reqSequence = pgSequence("req_seq", { startWith: 10600 });

export const employees = pgTable("employees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  department: text("department").notNull(),
});

export const analysts = pgTable("analysts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  tier: analystTier("tier").notNull(),
});

export const tickets = pgTable(
  "tickets",
  {
    id: text("id").primaryKey(),
    type: ticketType("type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: category("category").notNull(),
    priority: priority("priority").notNull(),
    affected: affected("affected").notNull(),
    status: ticketStatus("status").notNull(),
    requesterId: text("requester_id")
      .notNull()
      .references(() => employees.id),
    assignedTeam: text("assigned_team"),
    openedAt: ts("opened_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    /** Última resposta/atualização do analista: base do prazo (Anexo A). */
    lastAnalystUpdateAt: ts("last_analyst_update_at"),
    /** Prazo calculado pela regra de horário útil; nulo quando fechado. */
    dueAt: ts("due_at"),
    resolvedAt: ts("resolved_at"),
    /** Retry do cliente nunca duplica chamado. */
    idempotencyKey: text("idempotency_key").unique(),
  },
  (t) => [
    index("tickets_requester_idx").on(t.requesterId, t.status, t.updatedAt),
    index("tickets_due_idx").on(t.dueAt),
  ],
);

export const ticketEvents = pgTable(
  "ticket_events",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    kind: eventKind("kind").notNull(),
    authorKind: authorKind("author_kind").notNull(),
    authorId: text("author_id").notNull(),
    body: text("body").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("ticket_events_ticket_idx").on(t.ticketId, t.createdAt)],
);

export const helpArticles = pgTable(
  "help_articles",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    category: category("category").notNull(),
  },
  (t) => [
    index("help_articles_fts_idx").using(
      "gin",
      sql`to_tsvector('portuguese', ${t.title} || ' ' || ${t.body})`,
    ),
  ],
);
