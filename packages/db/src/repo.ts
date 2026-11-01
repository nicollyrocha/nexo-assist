import {
  MAX_MESSAGES_PER_SESSION,
  canTransition,
  type ConversationStatus,
  type TransferReason,
} from "@nexo/shared";
import { and, asc, desc, eq, lt, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type ConversationRow = typeof schema.conversations.$inferSelect;
export type MessageRow = typeof schema.messages.$inferSelect;
export type NewMessage = typeof schema.messages.$inferInsert;

// Isolamento: toda leitura do lado do funcionário exige o employeeId da sessão autenticada.
// Não há função "listar todas as conversas" para o funcionário; o console usa as funções de analista.

export async function createConversation(db: Db, employeeId: string): Promise<ConversationRow> {
  const [row] = await db.insert(schema.conversations).values({ employeeId }).returning();
  return row!;
}

export async function getConversationForEmployee(db: Db, employeeId: string, conversationId: string) {
  const [row] = await db
    .select()
    .from(schema.conversations)
    .where(
      and(eq(schema.conversations.id, conversationId), eq(schema.conversations.employeeId, employeeId)),
    );
  return row ?? null;
}

/** História 6: voltar outro dia e continuar de onde parou. */
export async function findResumableConversation(db: Db, employeeId: string) {
  const [row] = await db
    .select()
    .from(schema.conversations)
    .where(
      and(eq(schema.conversations.employeeId, employeeId), ne(schema.conversations.status, "encerrada")),
    )
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(1);
  return row ?? null;
}

export async function listMessagesForEmployee(db: Db, employeeId: string, conversationId: string) {
  const conversation = await getConversationForEmployee(db, employeeId, conversationId);
  if (!conversation) return null;
  return db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(asc(schema.messages.createdAt));
}

export async function appendMessage(db: Db, message: NewMessage): Promise<MessageRow> {
  const [row] = await db.insert(schema.messages).values(message).returning();
  await db
    .update(schema.conversations)
    .set({ updatedAt: sql`now()` })
    .where(eq(schema.conversations.id, message.conversationId));
  return row!;
}

type Transition = {
  conversationId: string;
  expectedVersion: number;
  from: ConversationStatus;
  to: ConversationStatus;
  analystId?: string | null;
  transferReason?: TransferReason | null;
  summary?: string | null;
};

/**
 * Muda o estado da conversa com controle otimista. Retorna null se a versão mudou
 * (outro analista agiu antes) ou se a transição não é permitida.
 */
export async function transitionConversation(db: Db, t: Transition): Promise<ConversationRow | null> {
  if (!canTransition(t.from, t.to)) return null;
  const [row] = await db
    .update(schema.conversations)
    .set({
      status: t.to,
      version: sql`${schema.conversations.version} + 1`,
      updatedAt: sql`now()`,
      ...(t.analystId !== undefined && { assignedAnalystId: t.analystId }),
      ...(t.transferReason !== undefined && { transferReason: t.transferReason }),
      ...(t.summary !== undefined && { summary: t.summary }),
    })
    .where(
      and(
        eq(schema.conversations.id, t.conversationId),
        eq(schema.conversations.version, t.expectedVersion),
        eq(schema.conversations.status, t.from),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Conta uma mensagem do funcionário na sessão. Atômico: retorna o novo total,
 * ou null se o limite de 30 mensagens já foi atingido.
 */
export async function countSessionMessage(db: Db, sessionId: string): Promise<number | null> {
  const [row] = await db
    .update(schema.sessions)
    .set({ messageCount: sql`${schema.sessions.messageCount} + 1` })
    .where(
      and(
        eq(schema.sessions.id, sessionId),
        lt(schema.sessions.messageCount, MAX_MESSAGES_PER_SESSION),
      ),
    )
    .returning({ messageCount: schema.sessions.messageCount });
  return row?.messageCount ?? null;
}
