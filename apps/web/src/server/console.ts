import { initialAgentState, type AgentState } from "@nexo/agent";
import {
  appendMessage,
  getAgentState,
  getConversationById,
  listConversationsForConsole,
  listMessagesForConversation,
  listTracesForConversation,
  saveAgentState,
  transitionConversation,
  type ConversationRow,
  type MessageRow,
} from "@nexo/db";
import {
  CONSOLE_FILTERS,
  type ConsoleConversation,
  type ConsoleFilter,
  type ConsoleList,
  type ConversationSummary,
  type MessageView,
  type SessionUser,
} from "@nexo/shared";
import type { Deps } from "./deps";
import { ApiFailure } from "./http";
import { analystIdsOf, toConversation, toMessageView, tracesById } from "./mappers";

// Camada de serviço do console do analista (Telas 4–5). O analista vê qualquer conversa;
// ações (assumir/devolver/encerrar) usam controle otimista por versão e ficam registradas
// como mensagem "sistema" na conversa.

export type AnalystCtx = { deps: Deps; user: SessionUser };

/** Teto de conversas não encerradas carregadas para a lista (todas as abas são subconjuntos dela). */
const CONSOLE_LIMIT = 500;

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const matchesFilter = (row: ConversationRow, filter: ConsoleFilter, analystId: string) => {
  switch (filter) {
    case "todas":
      return row.status !== "encerrada";
    case "para_voce":
      return row.status === "aguardando_atendente";
    case "com_agent":
      return row.status === "ativa";
    case "minhas":
      return row.status === "em_atendimento" && row.assignedAnalystId === analystId;
  }
};

/**
 * Lista do console. Carrega uma vez as conversas não encerradas (todas as abas são subconjuntos de
 * "todas"), descarta as que ainda não têm mensagem (login sem conversa) e conta as abas sobre o mesmo
 * conjunto — assim os contadores batem com o que a lista mostra. A busca `q` (nome do funcionário ou
 * prévia) é aplicada depois de juntar os nomes do serviço de chamados e não altera os contadores.
 */
export async function listConsole(ctx: AnalystCtx, filter: ConsoleFilter, q: string | null): Promise<ConsoleList> {
  const { db, directory } = ctx.deps;
  const rows = (await listConversationsForConsole(db, { filter: "todas", analystId: ctx.user.userId, limit: CONSOLE_LIMIT }))
    .filter((r) => r.lastMessage !== null);

  const counts = Object.fromEntries(
    CONSOLE_FILTERS.map((f) => [f, rows.filter((r) => matchesFilter(r.conversation, f, ctx.user.userId)).length]),
  ) as Record<ConsoleFilter, number>;

  const visible = rows.filter((r) => matchesFilter(r.conversation, filter, ctx.user.userId));
  const [employees, analysts] = await Promise.all([
    directory.employeesById(visible.map((r) => r.conversation.employeeId)),
    directory.analystNames(visible.flatMap((r) => (r.conversation.assignedAnalystId ? [r.conversation.assignedAnalystId] : []))),
  ]);

  let conversations: ConversationSummary[] = visible.map((r) => {
    const c = r.conversation;
    const e = employees.get(c.employeeId);
    return {
      id: c.id,
      employee: { id: c.employeeId, name: e?.name ?? c.employeeId, department: e?.department ?? "" },
      status: c.status,
      transferReason: c.transferReason,
      ticketId: c.ticketId,
      assignedAnalystId: c.assignedAnalystId,
      assignedAnalystName: c.assignedAnalystId ? (analysts.get(c.assignedAnalystId) ?? null) : null,
      lastMessagePreview: r.lastMessage!.preview,
      lastMessageRole: r.lastMessage!.role,
      lastMessageAt: r.lastMessage!.createdAt.toISOString(),
      minConfidence: r.minConfidence,
      waitingSince: r.waitingSince ? r.waitingSince.toISOString() : null,
    };
  });

  const needle = q ? normalize(q) : "";
  if (needle) {
    conversations = conversations.filter(
      (c) => normalize(c.employee.name).includes(needle) || normalize(c.lastMessagePreview).includes(needle),
    );
  }
  return { conversations, counts };
}

async function requireConversation(ctx: AnalystCtx, id: string): Promise<ConversationRow> {
  const row = await getConversationById(ctx.deps.db, id);
  if (!row) throw new ApiFailure("not_found", "Conversa não encontrada.");
  return row;
}

/** Detalhe (Tela 5): histórico, traces, funcionário e o painel com os chamados dele. */
export async function consoleDetail(ctx: AnalystCtx, id: string): Promise<ConsoleConversation> {
  const { db, directory, tickets } = ctx.deps;
  const conversation = await requireConversation(ctx, id);
  const [messages, traces, employee, ticketList] = await Promise.all([
    listMessagesForConversation(db, id),
    listTracesForConversation(db, id),
    directory.employee(conversation.employeeId),
    tickets.listTickets(conversation.employeeId),
  ]);
  if (!employee.ok) throw new ApiFailure("unavailable", "O sistema de chamados não respondeu. Tente de novo em instantes.");
  if (!employee.value) throw new ApiFailure("not_found", "Funcionário desta conversa não existe mais no cadastro.");

  const [analysts, assigned] = await Promise.all([
    directory.analystNames(analystIdsOf(conversation, messages)),
    directory.assigned(conversation.assignedAnalystId),
  ]);
  const names = { employeeName: employee.value.name, analysts };
  return {
    conversation: toConversation(conversation),
    messages: messages.map((m) => toMessageView(m, names)),
    traces: tracesById(traces),
    analystName: assigned?.name ?? null,
    analystTier: assigned?.tier ?? null,
    employee: employee.value,
    tickets: ticketList.ok ? ticketList.data : [],
    ticketsAvailable: ticketList.ok,
  };
}

const conflict = () =>
  new ApiFailure("conflict", "Esta conversa mudou enquanto você olhava (outro analista pode ter agido). Atualize e tente de novo.");

async function recordEvent(ctx: AnalystCtx, conversationId: string, text: string) {
  await appendMessage(ctx.deps.db, {
    conversationId,
    role: "sistema",
    authorId: null,
    content: text,
    blocks: [{ kind: "event", text }],
  });
}

/**
 * Assumir: aguardando_atendente → em_atendimento comigo (agent pausado).
 * A partir de "ativa" (analista entra numa conversa que o agent conduz), passa pelas duas etapas do
 * ciclo — ativa → aguardando_atendente → em_atendimento — sem pular estados (packages/shared).
 */
export async function claimConversation(ctx: AnalystCtx, id: string, version: number): Promise<ConsoleConversation> {
  const db = ctx.deps.db;
  let row = await requireConversation(ctx, id);
  if (row.version !== version) throw conflict();
  if (row.status === "ativa") {
    const waiting = await transitionConversation(db, {
      conversationId: id,
      expectedVersion: version,
      from: "ativa",
      to: "aguardando_atendente",
    });
    if (!waiting) throw conflict();
    row = waiting;
  } else if (row.status !== "aguardando_atendente") {
    throw conflict();
  }
  const claimed = await transitionConversation(db, {
    conversationId: id,
    expectedVersion: row.version,
    from: "aguardando_atendente",
    to: "em_atendimento",
    analystId: ctx.user.userId,
  });
  if (!claimed) throw conflict();
  await recordEvent(ctx, id, `${ctx.user.name} assumiu · agent pausado`);
  return consoleDetail(ctx, id);
}

async function requireMine(ctx: AnalystCtx, id: string, version: number): Promise<ConversationRow> {
  const row = await requireConversation(ctx, id);
  if (row.status !== "em_atendimento") throw conflict();
  if (row.assignedAnalystId !== ctx.user.userId) {
    throw new ApiFailure("forbidden", "Só quem está atendendo esta conversa pode fazer isso.");
  }
  if (row.version !== version) throw conflict();
  return row;
}

/** Devolver ao agent: em_atendimento → ativa. O agent recebe o que foi falado com o analista. */
export async function returnConversation(ctx: AnalystCtx, id: string, version: number): Promise<ConsoleConversation> {
  const db = ctx.deps.db;
  await requireMine(ctx, id, version);
  const back = await transitionConversation(db, {
    conversationId: id,
    expectedVersion: version,
    from: "em_atendimento",
    to: "ativa",
    analystId: null,
  });
  if (!back) throw conflict();

  const messages = await listMessagesForConversation(db, id);
  const handoff = handoffNote(ctx.user.name, messages);
  const stored = (await getAgentState(db, id)) as AgentState | null;
  const state: AgentState = stored && Array.isArray(stored.history) ? { ...stored, carryover: handoff } : initialAgentState(handoff);
  await saveAgentState(db, id, state);

  await recordEvent(ctx, id, `${ctx.user.name} devolveu a conversa ao agent · agent retomado`);
  return consoleDetail(ctx, id);
}

/** Encerrar: em_atendimento → encerrada. */
export async function closeConversation(ctx: AnalystCtx, id: string, version: number): Promise<ConsoleConversation> {
  await requireMine(ctx, id, version);
  const closed = await transitionConversation(ctx.deps.db, {
    conversationId: id,
    expectedVersion: version,
    from: "em_atendimento",
    to: "encerrada",
  });
  if (!closed) throw conflict();
  await recordEvent(ctx, id, `${ctx.user.name} encerrou a conversa`);
  return consoleDetail(ctx, id);
}

/** Mensagem do analista: só quando a conversa está em atendimento com ele. */
export async function postAnalystMessage(ctx: AnalystCtx, id: string, text: string): Promise<MessageView> {
  const row = await requireConversation(ctx, id);
  if (row.status !== "em_atendimento") throw new ApiFailure("conflict", "Assuma a conversa antes de responder.");
  if (row.assignedAnalystId !== ctx.user.userId) {
    throw new ApiFailure("forbidden", "Outro analista está atendendo esta conversa.");
  }
  const message = await appendMessage(ctx.deps.db, {
    conversationId: id,
    role: "analista",
    authorId: ctx.user.userId,
    content: text,
    blocks: [],
  });
  return toMessageView(message, { employeeName: "", analysts: new Map([[ctx.user.userId, ctx.user.name]]) });
}

/** O que aconteceu desde a última resposta do agent, para ele retomar sem pedir para repetir. */
function handoffNote(analystName: string, messages: MessageRow[]): string {
  const lastAgent = messages.findLastIndex((m) => m.role === "agent");
  const lines = messages
    .slice(lastAgent + 1)
    .filter((m) => m.role === "funcionario" || m.role === "analista")
    .slice(-10)
    .map((m) => `${m.role === "analista" ? "Analista" : "Funcionário"}: ${m.content.replace(/\s+/g, " ").slice(0, 300)}`);
  return [
    `O analista ${analystName} atendeu esta conversa e a devolveu a você.`,
    lines.length ? `O que foi conversado com ele: ${lines.join(" | ")}` : "Não houve troca de mensagens com o analista.",
  ].join(" ");
}
