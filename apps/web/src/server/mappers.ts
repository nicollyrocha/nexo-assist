import type { ConversationRow, MessageRow, TraceRow } from "@nexo/db";
import { DecisionTrace, type Conversation, type MessageView, type SessionUser } from "@nexo/shared";

// Linha do banco → tipos do contrato (packages/shared/src/web-api.ts).

export const AGENT_NAME = "Nexo Assist";
export const SYSTEM_NAME = "Sistema";
export const ANALYST_FALLBACK_NAME = "Analista do service desk";

export const homeFor = (role: SessionUser["role"]) => (role === "funcionario" ? "/chat" : "/console") as "/chat" | "/console";

const iso = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString();

export function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    employeeId: row.employeeId,
    status: row.status,
    assignedAnalystId: row.assignedAnalystId,
    transferReason: row.transferReason,
    summary: row.summary,
    ticketId: row.ticketId,
    version: row.version,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export type AuthorNames = {
  /** Nome do funcionário dono da conversa. */
  employeeName: string;
  /** Analistas por id. */
  analysts: Map<string, string>;
};

export function toMessageView(row: MessageRow, names: AuthorNames): MessageView {
  const authorName =
    row.role === "agent"
      ? AGENT_NAME
      : row.role === "sistema"
        ? SYSTEM_NAME
        : row.role === "funcionario"
          ? names.employeeName
          : (row.authorId && names.analysts.get(row.authorId)) || ANALYST_FALLBACK_NAME;
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    authorId: row.authorId,
    content: row.content,
    blocks: row.blocks,
    traceId: row.traceId,
    createdAt: iso(row.createdAt),
    authorName,
  };
}

/** Trace gravado, com o id da linha (é o que Message.traceId aponta). Linha corrompida é descartada. */
export function toTrace(row: TraceRow): DecisionTrace | null {
  const parsed = DecisionTrace.safeParse({ ...row.trace, id: row.id });
  return parsed.success ? parsed.data : null;
}

export function tracesById(rows: TraceRow[]): Record<string, DecisionTrace> {
  const out: Record<string, DecisionTrace> = {};
  for (const row of rows) {
    const trace = toTrace(row);
    if (trace) out[row.id] = trace;
  }
  return out;
}

/** Ids de analistas que aparecem na conversa (autores + quem está atendendo). */
export function analystIdsOf(conversation: ConversationRow, messages: MessageRow[]): string[] {
  const ids = new Set<string>();
  if (conversation.assignedAnalystId) ids.add(conversation.assignedAnalystId);
  for (const m of messages) if (m.role === "analista" && m.authorId) ids.add(m.authorId);
  return [...ids];
}
