import { z } from "zod";
import { Priority, Ticket, TicketDraft } from "./domain";

/**
 * Ciclo da conversa:
 *   ativa → aguardando_atendente → em_atendimento → ativa (devolvida) | encerrada
 * Em `aguardando_atendente` e `em_atendimento` o agent está pausado e o modelo não é chamado.
 */
export const CONVERSATION_STATUSES = [
  "ativa",
  "aguardando_atendente",
  "em_atendimento",
  "encerrada",
] as const;
export const ConversationStatus = z.enum(CONVERSATION_STATUSES);
export type ConversationStatus = z.infer<typeof ConversationStatus>;

const TRANSITIONS: Record<ConversationStatus, readonly ConversationStatus[]> = {
  ativa: ["aguardando_atendente", "encerrada"],
  aguardando_atendente: ["em_atendimento", "ativa", "encerrada"],
  em_atendimento: ["ativa", "encerrada"],
  encerrada: [],
};

export const canTransition = (from: ConversationStatus, to: ConversationStatus) =>
  TRANSITIONS[from].includes(to);

export const isAgentPaused = (status: ConversationStatus) =>
  status === "aguardando_atendente" || status === "em_atendimento";

export const TRANSFER_REASONS = [
  "pedido_do_funcionario",
  "caso_critico",
  "chamado_vencido",
  "baixa_confianca",
] as const;
export const TransferReason = z.enum(TRANSFER_REASONS);
export type TransferReason = z.infer<typeof TransferReason>;

export const Conversation = z.object({
  id: z.string(),
  employeeId: z.string(),
  status: ConversationStatus,
  assignedAnalystId: z.string().nullable(),
  transferReason: TransferReason.nullable(),
  /** Resumo do caso: levado ao analista na transferência e usado para retomar a conversa. */
  summary: z.string().nullable(),
  /** Chamado em foco na conversa, quando houver. */
  ticketId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Conversation = z.infer<typeof Conversation>;

/** Blocos estruturados que a UI renderiza abaixo do texto de uma mensagem. */
export const MessageBlock = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ticket_cards"), tickets: z.array(Ticket) }),
  z.object({
    kind: z.literal("ticket_selection"),
    prompt: z.string(),
    tickets: z.array(Ticket),
  }),
  z.object({
    kind: z.literal("draft"),
    actionId: z.string(),
    draft: TicketDraft,
    dueAtPreview: z.iso.datetime(),
  }),
  /** Proposta de complementar ou reabrir um chamado, aguardando confirmação (Anexo A: abertura). */
  z.object({
    kind: z.literal("update_draft"),
    actionId: z.string(),
    ticket: Ticket,
    comment: z.string(),
    newPriority: Priority.nullable(),
    reopen: z.boolean(),
  }),
  z.object({ kind: z.literal("quick_replies"), options: z.array(z.string()).min(1).max(4) }),
  z.object({
    kind: z.literal("event"),
    text: z.string(),
  }),
]);
export type MessageBlock = z.infer<typeof MessageBlock>;

export const MESSAGE_ROLES = ["funcionario", "agent", "analista", "sistema"] as const;
export const MessageRole = z.enum(MESSAGE_ROLES);
export type MessageRole = z.infer<typeof MessageRole>;

export const Message = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: MessageRole,
  /** Id do funcionário ou analista; nulo para agent e sistema. */
  authorId: z.string().nullable(),
  content: z.string(),
  blocks: z.array(MessageBlock),
  /** Presente nas mensagens do agent: liga a resposta ao detalhe da decisão. */
  traceId: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type Message = z.infer<typeof Message>;
