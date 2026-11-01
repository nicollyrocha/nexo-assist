import { z } from "zod";
import { Analyst, Employee, HelpArticle, Priority, Ticket, TicketDraft, TicketEvent } from "./domain";
import { TransferReason } from "./conversation";

// Contrato HTTP do serviço de chamados, compartilhado pelo serviço (validação da entrada)
// e pelo cliente (validação da resposta).

export const SERVICE_KEY_HEADER = "x-service-key";
export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";

export const TicketWithEvents = Ticket.extend({ events: z.array(TicketEvent) });
export type TicketWithEvents = z.infer<typeof TicketWithEvents>;

export const CreateTicketInput = TicketDraft;
export type CreateTicketInput = z.infer<typeof CreateTicketInput>;

/** Complementar um chamado (história 3); opcionalmente reclassificar a prioridade. */
export const AddCommentInput = z.object({
  body: z.string().trim().min(1).max(4000),
  priority: Priority.optional(),
  priorityReason: z.string().optional(),
});
export type AddCommentInput = z.infer<typeof AddCommentInput>;

export const ReopenTicketInput = z.object({ reason: z.string().trim().min(1).max(4000) });
export type ReopenTicketInput = z.infer<typeof ReopenTicketInput>;

export const TransferTicketInput = z.object({
  reason: TransferReason,
  summary: z.string().trim().min(1).max(4000),
});
export type TransferTicketInput = z.infer<typeof TransferTicketInput>;

export const ApiError = z.object({
  error: z.object({
    code: z.enum([
      "unauthorized",
      "not_found",
      "invalid_input",
      "reopen_window_expired",
      "ticket_closed",
      "ticket_not_resolved",
      "unavailable",
      "internal",
    ]),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;
export type ApiErrorCode = ApiError["error"]["code"];

export const ApiResponses = {
  employee: Employee,
  analyst: Analyst,
  tickets: z.array(Ticket),
  ticket: TicketWithEvents,
  articles: z.array(HelpArticle),
} as const;
