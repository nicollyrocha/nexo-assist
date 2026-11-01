import {
  CONFIDENCE_LEVELS,
  CONVERSATION_STATUSES,
  INTENTS,
  MESSAGE_ROLES,
  OUTCOMES,
  TRANSFER_REASONS,
  type DecisionTrace,
  type MessageBlock,
} from "@nexo/shared";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Banco da aplicação: sessões, conversas, mensagens e DecisionTraces.
// Chamados, funcionários e central de ajuda vivem no serviço de chamados (apps/tickets).

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const userRole = pgEnum("user_role", ["funcionario", "analista"]);
export const conversationStatus = pgEnum("conversation_status", CONVERSATION_STATUSES);
export const transferReason = pgEnum("transfer_reason", TRANSFER_REASONS);
export const messageRole = pgEnum("message_role", MESSAGE_ROLES);
export const intent = pgEnum("intent", INTENTS);
export const outcome = pgEnum("outcome", OUTCOMES);
export const confidenceLevel = pgEnum("confidence_level", CONFIDENCE_LEVELS);

/** Sessão de login. O limite de 30 mensagens do funcionário é contado aqui. */
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  role: userRole("role").notNull(),
  messageCount: integer("message_count").notNull().default(0),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: text("employee_id").notNull(),
    status: conversationStatus("status").notNull().default("ativa"),
    assignedAnalystId: text("assigned_analyst_id"),
    transferReason: transferReason("transfer_reason"),
    summary: text("summary"),
    ticketId: text("ticket_id"),
    /** Controle otimista: dois analistas não assumem a mesma conversa. */
    version: integer("version").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("conversations_employee_idx").on(t.employeeId, t.updatedAt),
    index("conversations_status_idx").on(t.status, t.updatedAt),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    authorId: text("author_id"),
    content: text("content").notNull(),
    blocks: jsonb("blocks").$type<MessageBlock[]>().notNull().default([]),
    traceId: uuid("trace_id"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

/**
 * Trace completo em JSONB (validado por zod na aplicação) + colunas extraídas para
 * filtros do console (baixa confiança, transferidas) e acompanhamento de custo.
 */
export const decisionTraces = pgTable(
  "decision_traces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    trace: jsonb("trace").$type<DecisionTrace>().notNull(),
    intent: intent("intent").notNull(),
    outcome: outcome("outcome").notNull(),
    confidenceLevel: confidenceLevel("confidence_level").notNull(),
    confidenceScore: real("confidence_score").notNull(),
    transferred: boolean("transferred").notNull().default(false),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("traces_conversation_idx").on(t.conversationId, t.createdAt),
    index("traces_confidence_idx").on(t.confidenceLevel, t.createdAt),
  ],
);
