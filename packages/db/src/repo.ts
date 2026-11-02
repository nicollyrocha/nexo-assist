import {
  MAX_MESSAGES_PER_SESSION,
  canTransition,
  type ConsoleFilter,
  type ConversationStatus,
  type DecisionTrace,
  type MessageRole,
  type TransferReason,
} from "@nexo/shared";
import { and, asc, desc, eq, gt, lt, min, ne, sql, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type ConversationRow = typeof schema.conversations.$inferSelect;
export type MessageRow = typeof schema.messages.$inferSelect;
export type NewMessage = typeof schema.messages.$inferInsert;
export type SessionRow = typeof schema.sessions.$inferSelect;
export type TraceRow = typeof schema.decisionTraces.$inferSelect;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ids vêm de cookie/URL: um valor que não é uuid daria erro de sintaxe no Postgres — tratamos como "não existe". */
const isUuid = (id: string) => UUID_RE.test(id);

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

/** Conversa mais recente do funcionário, inclusive encerrada (para mostrar "encerrada" antes de começar outra). */
export async function findLatestConversation(db: Db, employeeId: string) {
  const [row] = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.employeeId, employeeId))
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
  /** Chamado em foco (ex.: o chamado levado ao analista na transferência). */
  ticketId?: string | null;
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
      statusChangedAt: sql`now()`,
      version: sql`${schema.conversations.version} + 1`,
      updatedAt: sql`now()`,
      ...(t.analystId !== undefined && { assignedAnalystId: t.analystId }),
      ...(t.transferReason !== undefined && { transferReason: t.transferReason }),
      ...(t.summary !== undefined && { summary: t.summary }),
      ...(t.ticketId !== undefined && { ticketId: t.ticketId }),
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

/** Conversa por id, SEM filtro de funcionário — uso exclusivo do console do analista. */
export async function getConversationById(db: Db, conversationId: string): Promise<ConversationRow | null> {
  if (!isUuid(conversationId)) return null;
  const [row] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, conversationId));
  return row ?? null;
}

/** Grava o estado do agent entre turnos (opaco para o banco; quem valida é packages/agent). */
export async function saveAgentState(db: Db, conversationId: string, state: unknown): Promise<void> {
  await db
    .update(schema.conversations)
    .set({ agentState: state ?? null })
    .where(eq(schema.conversations.id, conversationId));
}

/** Estado do agent salvo no último turno, ou null se não houver. */
export async function getAgentState(db: Db, conversationId: string): Promise<unknown> {
  if (!isUuid(conversationId)) return null;
  const [row] = await db
    .select({ agentState: schema.conversations.agentState })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId));
  return row?.agentState ?? null;
}

// ---- Mensagens e traces --------------------------------------------------------------------

/**
 * Mensagens de uma conversa SEM filtro de funcionário — só para o console do analista
 * (ou depois de o chamador já ter checado o acesso). O lado do funcionário usa listMessagesForEmployee.
 */
export async function listMessagesForConversation(db: Db, conversationId: string): Promise<MessageRow[]> {
  if (!isUuid(conversationId)) return [];
  return db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(asc(schema.messages.createdAt));
}

/**
 * Persiste o DecisionTrace do turno com as colunas extraídas para filtro e custo.
 * Usa o id do próprio trace quando é uuid (assim Message.traceId bate com o trace); retorna o id gravado.
 * transferred = desfecho "transferiu" ou transfer_to_analyst que não falhou.
 */
export async function saveTrace(db: Db, conversationId: string, trace: DecisionTrace): Promise<string> {
  const transferred =
    trace.outcome === "transferiu" ||
    trace.actions.some((a) => a.tool === "transfer_to_analyst" && a.outcome !== "erro");
  const [row] = await db
    .insert(schema.decisionTraces)
    .values({
      ...(isUuid(trace.id) && { id: trace.id }),
      conversationId,
      trace,
      intent: trace.intent,
      outcome: trace.outcome,
      confidenceLevel: trace.confidence.level,
      confidenceScore: trace.confidence.score,
      transferred,
      inputTokens: trace.usage.inputTokens,
      outputTokens: trace.usage.outputTokens,
      cacheReadTokens: trace.usage.cacheReadTokens,
    })
    .returning({ id: schema.decisionTraces.id });
  return row!.id;
}

/** Traces da conversa em ordem cronológica. SEM filtro de funcionário: chamar só após checar o acesso. */
export async function listTracesForConversation(db: Db, conversationId: string): Promise<TraceRow[]> {
  if (!isUuid(conversationId)) return [];
  return db
    .select()
    .from(schema.decisionTraces)
    .where(eq(schema.decisionTraces.conversationId, conversationId))
    .orderBy(asc(schema.decisionTraces.createdAt));
}

// ---- Console do analista -------------------------------------------------------------------

const PREVIEW_LENGTH = 120;

const consoleFilterWhere = (filter: ConsoleFilter, analystId: string): SQL => {
  const c = schema.conversations;
  switch (filter) {
    case "para_voce":
      return eq(c.status, "aguardando_atendente");
    case "com_agent":
      return eq(c.status, "ativa");
    case "minhas":
      return and(eq(c.status, "em_atendimento"), eq(c.assignedAnalystId, analystId))!;
    case "todas":
      return ne(c.status, "encerrada");
  }
};

export type ConsoleConversationRow = {
  conversation: ConversationRow;
  lastMessage: { preview: string; role: MessageRole; createdAt: Date } | null;
  /** Menor confidence_score dos traces da conversa; null se o agent ainda não respondeu. */
  minConfidence: number | null;
  /** Desde quando aguarda atendente (só nesse status; vem de status_changed_at). */
  waitingSince: Date | null;
};

const toPreview = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH - 1)}…` : flat;
};

/**
 * Lista do console (Tela 4) em uma única query: conversa + última mensagem + menor confiança,
 * via LEFT JOIN LATERAL (sem N+1). Ordem: última atividade (updated_at) primeiro.
 */
export async function listConversationsForConsole(
  db: Db,
  opts: { filter: ConsoleFilter; analystId: string; limit?: number },
): Promise<ConsoleConversationRow[]> {
  const c = schema.conversations;
  const m = schema.messages;
  const t = schema.decisionTraces;

  const lastMessage = db
    .select({
      // Corta no banco (com folga para colapsar espaços) para não trafegar mensagens longas.
      content: sql<string>`left(${m.content}, ${PREVIEW_LENGTH * 2})`.as("last_content"),
      role: m.role,
      createdAt: m.createdAt,
    })
    .from(m)
    .where(eq(m.conversationId, c.id))
    .orderBy(desc(m.createdAt))
    .limit(1)
    .as("last_message");

  const confidence = db
    .select({ minConfidence: min(t.confidenceScore).as("min_confidence") })
    .from(t)
    .where(eq(t.conversationId, c.id))
    .as("confidence");

  const rows = await db
    .select({
      conversation: c,
      lastContent: lastMessage.content,
      lastRole: lastMessage.role,
      lastCreatedAt: lastMessage.createdAt,
      minConfidence: confidence.minConfidence,
    })
    .from(c)
    .leftJoinLateral(lastMessage, sql`true`)
    .leftJoinLateral(confidence, sql`true`)
    .where(consoleFilterWhere(opts.filter, opts.analystId))
    .orderBy(desc(c.updatedAt))
    .limit(opts.limit ?? 100);

  return rows.map((r) => ({
    conversation: r.conversation,
    lastMessage:
      r.lastContent !== null && r.lastRole !== null && r.lastCreatedAt !== null
        ? { preview: toPreview(r.lastContent), role: r.lastRole, createdAt: r.lastCreatedAt }
        : null,
    minConfidence: r.minConfidence === null ? null : Number(r.minConfidence),
    waitingSince: r.conversation.status === "aguardando_atendente" ? r.conversation.statusChangedAt : null,
  }));
}

/** Contagem de cada filtro do console em uma única query (count ... filter). */
export async function countConversationsByFilter(
  db: Db,
  analystId: string,
): Promise<Record<ConsoleFilter, number>> {
  const n = (filter: ConsoleFilter) =>
    sql<number>`count(*) filter (where ${consoleFilterWhere(filter, analystId)})`.mapWith(Number);
  const [row] = await db
    .select({ todas: n("todas"), para_voce: n("para_voce"), com_agent: n("com_agent"), minhas: n("minhas") })
    .from(schema.conversations);
  return { todas: row!.todas, para_voce: row!.para_voce, com_agent: row!.com_agent, minhas: row!.minhas };
}

// ---- Sessões -------------------------------------------------------------------------------

/** Cria a sessão de login (nenhuma senha é armazenada: o login aceita qualquer senha por definição). */
export async function createSession(
  db: Db,
  s: { userId: string; role: SessionRow["role"]; ttlMs: number },
): Promise<SessionRow> {
  const [row] = await db
    .insert(schema.sessions)
    .values({ userId: s.userId, role: s.role, expiresAt: new Date(Date.now() + s.ttlMs) })
    .returning();
  return row!;
}

/** Sessão válida pelo id do cookie; null se não existe ou já expirou. */
export async function getActiveSession(db: Db, sessionId: string): Promise<SessionRow | null> {
  if (!isUuid(sessionId)) return null;
  const [row] = await db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.id, sessionId), gt(schema.sessions.expiresAt, sql`now()`)));
  return row ?? null;
}

/** Logout: apaga a sessão. */
export async function deleteSession(db: Db, sessionId: string): Promise<void> {
  if (!isUuid(sessionId)) return;
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}

/** Mensagens já usadas na sessão (para "x de 30"); null se a sessão não existe. */
export async function getSessionMessageCount(db: Db, sessionId: string): Promise<number | null> {
  if (!isUuid(sessionId)) return null;
  const [row] = await db
    .select({ messageCount: schema.sessions.messageCount })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId));
  return row?.messageCount ?? null;
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
