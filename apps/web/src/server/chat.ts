import { initialAgentState, runTurn, type AgentState } from "@nexo/agent";
import {
  appendMessage,
  countSessionMessage,
  createConversation,
  findLatestConversation,
  findResumableConversation,
  getAgentState,
  getConversationForEmployee,
  getSessionMessageCount,
  listMessagesForEmployee,
  listTracesForConversation,
  saveAgentState,
  saveTrace,
  transitionConversation,
  type ConversationRow,
} from "@nexo/db";
import {
  MAX_MESSAGES_PER_SESSION,
  isAgentPaused,
  type ChatStreamEvent,
  type ConversationView,
  type Employee,
  type SessionUser,
} from "@nexo/shared";
import type { Deps } from "./deps";
import { ApiFailure, logError } from "./http";
import { analystIdsOf, toConversation, toMessageView, tracesById } from "./mappers";

// Camada de serviço do chat do funcionário. Os Route Handlers só autenticam e chamam daqui;
// os testes chamam os handlers (ou estas funções) com PGlite + serviço falso + modelo roteirizado.
// Isolamento: toda leitura passa pelo employeeId da sessão (user.userId), nunca por dado do cliente.

export type EmployeeCtx = { deps: Deps; user: SessionUser; sessionStartedAt: Date };

const employeeOf = (user: SessionUser): Employee => ({
  id: user.userId,
  name: user.name,
  email: user.email,
  department: user.detail,
});

/** Estado do agent gravado no banco (opaco lá). Formato inesperado = recomeça com o resumo. */
function parseAgentState(raw: unknown, fallbackCarryover: string | null): AgentState {
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as AgentState).history) &&
    typeof (raw as AgentState).turn === "number"
  ) {
    const s = raw as AgentState;
    return { history: s.history, turn: s.turn, pendingAction: s.pendingAction ?? null, carryover: s.carryover ?? null };
  }
  return initialAgentState(fallbackCarryover);
}

/**
 * Conversa em andamento (história 6: volta de outro dia e continua). Se a última foi encerrada
 * durante esta sessão, devolve a encerrada (a tela mostra o fim e oferece "nova conversa").
 * Senão cria uma nova, levando o resumo da anterior para o agent.
 */
export async function currentConversation(ctx: EmployeeCtx): Promise<ConversationRow> {
  const { db } = ctx.deps;
  const resumable = await findResumableConversation(db, ctx.user.userId);
  if (resumable) return resumable;
  const latest = await findLatestConversation(db, ctx.user.userId);
  if (latest && latest.statusChangedAt >= ctx.sessionStartedAt) return latest;
  return startConversation(ctx, latest);
}

async function startConversation(ctx: EmployeeCtx, previous: ConversationRow | null): Promise<ConversationRow> {
  const row = await createConversation(ctx.deps.db, ctx.user.userId);
  if (previous?.summary) await saveAgentState(ctx.deps.db, row.id, initialAgentState(previous.summary));
  return row;
}

/** POST /api/chat/new: só cria se não houver conversa em andamento (senão devolve a atual). */
export async function newConversation(ctx: EmployeeCtx): Promise<ConversationRow> {
  const resumable = await findResumableConversation(ctx.deps.db, ctx.user.userId);
  if (resumable) return resumable;
  return startConversation(ctx, await findLatestConversation(ctx.deps.db, ctx.user.userId));
}

export async function conversationView(ctx: EmployeeCtx, conversation: ConversationRow): Promise<ConversationView> {
  const { db, directory } = ctx.deps;
  const messages = await listMessagesForEmployee(db, ctx.user.userId, conversation.id);
  if (!messages) throw new ApiFailure("not_found", "Conversa não encontrada.");
  const [traces, used, analysts, assigned] = await Promise.all([
    listTracesForConversation(db, conversation.id),
    getSessionMessageCount(db, ctx.user.sessionId),
    directory.analystNames(analystIdsOf(conversation, messages)),
    directory.assigned(conversation.assignedAnalystId),
  ]);
  const names = { employeeName: ctx.user.name, analysts };
  return {
    conversation: toConversation(conversation),
    messages: messages.map((m) => toMessageView(m, names)),
    traces: tracesById(traces),
    analystName: assigned?.name ?? null,
    analystTier: assigned?.tier ?? null,
    messagesUsed: used ?? 0,
    messagesLimit: MAX_MESSAGES_PER_SESSION,
  };
}

/**
 * Um turno do chat, emitindo eventos na ordem: saved → (paused | action/text… → done) ou error.
 * Agent pausado = agent mudo: com a conversa com analista, a mensagem é gravada e o modelo não é chamado.
 */
export async function sendMessage(
  ctx: EmployeeCtx,
  text: string,
  emit: (event: ChatStreamEvent) => void,
): Promise<void> {
  const { db } = ctx.deps;
  const user = ctx.user;
  const conversation = (await findResumableConversation(db, user.userId)) ?? (await startConversation(ctx, await findLatestConversation(db, user.userId)));

  // Limite de 30 mensagens por sessão, atômico no banco.
  const used = await countSessionMessage(db, user.sessionId);
  if (used === null) {
    emit({
      type: "error",
      error: {
        code: "limit_reached",
        message: `Você chegou ao limite de ${MAX_MESSAGES_PER_SESSION} mensagens desta sessão. Para continuar, saia e entre de novo.`,
      },
    });
    return;
  }

  const saved = await appendMessage(db, {
    conversationId: conversation.id,
    role: "funcionario",
    authorId: user.userId,
    content: text,
    blocks: [],
  });
  const names = { employeeName: user.name, analysts: new Map<string, string>() };
  emit({ type: "saved", message: toMessageView(saved, names), messagesUsed: used });

  // Relê o status: um analista pode ter assumido enquanto a mensagem chegava.
  const fresh = (await getConversationForEmployee(db, user.userId, conversation.id)) ?? conversation;
  if (isAgentPaused(fresh.status)) {
    emit({ type: "paused", conversation: toConversation(fresh) });
    return;
  }

  const state = parseAgentState(await getAgentState(db, fresh.id), fresh.summary);
  const result = await runTurn({
    agent: ctx.deps.agent,
    modelId: ctx.deps.modelId,
    tickets: ctx.deps.tickets,
    employee: employeeOf(user),
    conversationId: fresh.id,
    state,
    userMessage: text,
    now: ctx.deps.now(),
    onText: (delta) => emit({ type: "text", delta }),
    onAction: (action) => emit({ type: "action", action }),
  });

  const traceId = await saveTrace(db, fresh.id, result.trace);
  const agentMessage = await appendMessage(db, {
    conversationId: fresh.id,
    role: "agent",
    authorId: null,
    content: result.reply,
    blocks: result.blocks,
    traceId,
  });
  await saveAgentState(db, fresh.id, result.state);

  if (result.transfer) await transfer(ctx, fresh, result.transfer);

  const final = (await getConversationForEmployee(db, user.userId, fresh.id)) ?? fresh;
  emit({
    type: "done",
    message: toMessageView(agentMessage, names),
    trace: { ...result.trace, id: traceId },
    conversation: toConversation(final),
  });
}

/** Transferência decidida pelo agent: conversa vai para "aguardando atendente" com o resumo pronto. */
async function transfer(
  ctx: EmployeeCtx,
  conversation: ConversationRow,
  t: { reason: NonNullable<ConversationRow["transferReason"]>; summary: string; ticketId: string | null },
) {
  let current: ConversationRow | null = conversation;
  // Até duas tentativas: a versão pode ter mudado por outra mensagem, sem mudar o status.
  for (let attempt = 0; attempt < 2 && current && current.status === "ativa"; attempt++) {
    const moved = await transitionConversation(ctx.deps.db, {
      conversationId: current.id,
      expectedVersion: current.version,
      from: "ativa",
      to: "aguardando_atendente",
      transferReason: t.reason,
      summary: t.summary,
      ...(t.ticketId && { ticketId: t.ticketId }),
    });
    if (moved) return;
    current = await getConversationForEmployee(ctx.deps.db, ctx.user.userId, conversation.id);
  }
  if (current?.status === "ativa") {
    logError("chat.transfer", new Error("não foi possível transferir a conversa"), { conversationId: conversation.id });
  }
}
