import { z } from "zod";
import { Conversation, ConversationStatus, Message, TransferReason } from "./conversation";
import { Employee, Ticket } from "./domain";
import { DecisionTrace, TraceAction } from "./trace";

// Contrato entre a interface (apps/web, client) e os Route Handlers (apps/web/src/app/api).
// Frontend e backend implementam contra este arquivo; mudou aqui, mudou nos dois lados.

// ---- Sessão --------------------------------------------------------------------------------

export const SessionUser = z.object({
  sessionId: z.string(),
  userId: z.string(),
  role: z.enum(["funcionario", "analista"]),
  name: z.string(),
  email: z.email(),
  /** Área (funcionário) ou nível N1/N2 (analista). */
  detail: z.string(),
});
export type SessionUser = z.infer<typeof SessionUser>;

/** POST /api/auth/login — aceita qualquer senha para quem existe nos dados de exemplo. */
export const LoginInput = z.object({ email: z.email(), password: z.string().min(1) });
export type LoginInput = z.infer<typeof LoginInput>;
/** 200 → `{ user, redirectTo }`; 401 → `ApiErrorBody` com code "invalid_credentials". */
export const LoginResponse = z.object({ user: SessionUser, redirectTo: z.enum(["/chat", "/console"]) });
// POST /api/auth/logout → 204.

export const ApiErrorBody = z.object({
  error: z.object({
    code: z.enum([
      "invalid_credentials",
      "unauthorized",
      "forbidden",
      "not_found",
      "invalid_input",
      "limit_reached",
      "conflict",
      "agent_paused",
      "unavailable",
      "internal",
    ]),
    message: z.string(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

// ---- Chat do funcionário -------------------------------------------------------------------

export const MessageView = Message.extend({
  /** Nome exibido: "Nexo Assist", nome do analista ou do funcionário. */
  authorName: z.string(),
});
export type MessageView = z.infer<typeof MessageView>;

export const ConversationView = z.object({
  conversation: Conversation,
  messages: z.array(MessageView),
  /** Traces das mensagens do agent, por id (Message.traceId). */
  traces: z.record(z.string(), DecisionTrace),
  /** Analista que está atendendo, quando houver. */
  analystName: z.string().nullable(),
  messagesUsed: z.number().int(),
  messagesLimit: z.number().int(),
});
export type ConversationView = z.infer<typeof ConversationView>;

/**
 * GET  /api/chat                → ConversationView da conversa em andamento (cria uma se não houver).
 * POST /api/chat/new            → encerra nada; cria conversa nova e devolve ConversationView
 *                                 (usado depois que a anterior foi encerrada).
 * POST /api/chat/messages       → body SendMessageInput; resposta é um stream SSE de ChatStreamEvent.
 *                                 Com o agent pausado, a mensagem é salva e o stream emite só "saved" + "paused".
 * O cliente faz polling de GET /api/chat a cada ~3 s enquanto a conversa está com analista.
 */
export const SendMessageInput = z.object({ text: z.string().trim().min(1).max(2000) });
export type SendMessageInput = z.infer<typeof SendMessageInput>;

export const ChatStreamEvent = z.discriminatedUnion("type", [
  /** A mensagem do funcionário foi gravada. */
  z.object({ type: z.literal("saved"), message: MessageView, messagesUsed: z.number().int() }),
  /** Uma ferramenta terminou: vira um chip de ação na hora. */
  z.object({ type: z.literal("action"), action: TraceAction }),
  /** Pedaço da resposta do agent. */
  z.object({ type: z.literal("text"), delta: z.string() }),
  /** Fim do turno: mensagem final (com blocos), trace e conversa atualizada (pode ter sido transferida). */
  z.object({ type: z.literal("done"), message: MessageView, trace: DecisionTrace, conversation: Conversation }),
  /** Conversa está com analista: o agent não respondeu. */
  z.object({ type: z.literal("paused"), conversation: Conversation }),
  z.object({ type: z.literal("error"), error: ApiErrorBody.shape.error }),
]);
export type ChatStreamEvent = z.infer<typeof ChatStreamEvent>;

// ---- Console do analista -------------------------------------------------------------------

export const CONSOLE_FILTERS = ["todas", "para_voce", "com_agent", "minhas"] as const;
export const ConsoleFilter = z.enum(CONSOLE_FILTERS);
export type ConsoleFilter = z.infer<typeof ConsoleFilter>;

export const ConversationSummary = z.object({
  id: z.string(),
  employee: Employee.pick({ id: true, name: true, department: true }),
  status: ConversationStatus,
  transferReason: TransferReason.nullable(),
  assignedAnalystId: z.string().nullable(),
  assignedAnalystName: z.string().nullable(),
  lastMessagePreview: z.string(),
  lastMessageRole: z.enum(["funcionario", "agent", "analista", "sistema"]),
  lastMessageAt: z.iso.datetime(),
  /** Menor confiança registrada pelo agent nesta conversa (0–1), para destacar "agent pediu ajuda". */
  minConfidence: z.number().nullable(),
  /** Aguardando atendente desde (para "contato em X min"). */
  waitingSince: z.iso.datetime().nullable(),
});
export type ConversationSummary = z.infer<typeof ConversationSummary>;

/**
 * GET /api/console/conversations?filter=todas|para_voce|com_agent|minhas&q=texto
 *     → { conversations: ConversationSummary[], counts: Record<ConsoleFilter, number> }
 *     para_voce = aguardando_atendente; com_agent = ativa; minhas = em_atendimento comigo.
 */
export const ConsoleList = z.object({
  conversations: z.array(ConversationSummary),
  counts: z.record(ConsoleFilter, z.number().int()),
});
export type ConsoleList = z.infer<typeof ConsoleList>;

/** GET /api/console/conversations/:id → detalhe com o painel de chamados do funcionário. */
export const ConsoleConversation = ConversationView.omit({ messagesUsed: true, messagesLimit: true }).extend({
  employee: Employee,
  tickets: z.array(Ticket),
  /** false quando o serviço de chamados não respondeu: o painel mostra aviso em vez de lista vazia. */
  ticketsAvailable: z.boolean(),
});
export type ConsoleConversation = z.infer<typeof ConsoleConversation>;

/**
 * POST /api/console/conversations/:id/claim   body ConsoleActionInput → ConsoleConversation
 *      (aguardando_atendente|ativa → em_atendimento comigo; agent pausado)
 * POST /api/console/conversations/:id/return  → devolve ao agent (em_atendimento → ativa)
 * POST /api/console/conversations/:id/close   → encerra
 * 409 "conflict" quando a versão mudou (outro analista agiu antes).
 * POST /api/console/conversations/:id/messages body SendMessageInput → MessageView
 *      (só quando em_atendimento comigo)
 */
export const ConsoleActionInput = z.object({ version: z.number().int() });
export type ConsoleActionInput = z.infer<typeof ConsoleActionInput>;
