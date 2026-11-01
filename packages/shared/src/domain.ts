import { z } from "zod";

// Vocabulário do Anexo A. Valores em português porque aparecem no domínio do service desk;
// os rótulos de exibição ficam em `labels.ts`.

export const TICKET_TYPES = ["INC", "REQ"] as const;
export const TicketType = z.enum(TICKET_TYPES);
export type TicketType = z.infer<typeof TicketType>;

export const CATEGORIES = ["acesso", "rede_vpn", "hardware", "software", "email", "outros"] as const;
export const Category = z.enum(CATEGORIES);
export type Category = z.infer<typeof Category>;

export const PRIORITIES = ["critica", "alta", "media", "baixa"] as const;
export const Priority = z.enum(PRIORITIES);
export type Priority = z.infer<typeof Priority>;

/** Quem é afetado — alimenta o impacto na regra de prioridade. */
export const AFFECTED = ["so_eu", "minha_equipe", "empresa"] as const;
export const Affected = z.enum(AFFECTED);
export type Affected = z.infer<typeof Affected>;

export const TICKET_STATUSES = [
  "aberto",
  "em_andamento",
  "aguardando_analista",
  "aguardando_funcionario",
  "aprovado",
  "resolvido",
  "fechado",
] as const;
export const TicketStatus = z.enum(TICKET_STATUSES);
export type TicketStatus = z.infer<typeof TicketStatus>;

const CLOSED_STATUSES: readonly TicketStatus[] = ["resolvido", "fechado"];
export const isOpenStatus = (status: TicketStatus) => !CLOSED_STATUSES.includes(status);

/** Anexo A: resolvidos há até 7 dias podem ser reabertos. */
export const REOPEN_WINDOW_DAYS = 7;

/** Limite do desafio: mensagens do funcionário por sessão de chat. */
export const MAX_MESSAGES_PER_SESSION = 30;

export const Employee = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  department: z.string(),
});
export type Employee = z.infer<typeof Employee>;

export const ANALYST_TIERS = ["N1", "N2"] as const;
export const Analyst = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  tier: z.enum(ANALYST_TIERS),
});
export type Analyst = z.infer<typeof Analyst>;

export const Ticket = z.object({
  /** Código legível, ex.: INC-20311. */
  id: z.string().regex(/^(INC|REQ)-\d+$/),
  type: TicketType,
  title: z.string().min(1),
  description: z.string().min(1),
  category: Category,
  priority: Priority,
  affected: Affected,
  status: TicketStatus,
  requesterId: z.string(),
  assignedTeam: z.string().nullable(),
  openedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** Prazo da próxima resposta/atualização (Anexo A). Nulo quando fechado. */
  dueAt: z.iso.datetime().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
});
export type Ticket = z.infer<typeof Ticket>;

export const TICKET_EVENT_KINDS = ["comentario", "status", "transferencia", "reabertura"] as const;
export const TicketEvent = z.object({
  id: z.string(),
  ticketId: z.string(),
  kind: z.enum(TICKET_EVENT_KINDS),
  authorKind: z.enum(["funcionario", "analista", "agent"]),
  authorId: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
});
export type TicketEvent = z.infer<typeof TicketEvent>;

/** Rascunho mostrado ao funcionário antes de criar (Anexo A: abertura). */
export const TicketDraft = Ticket.pick({
  type: true,
  title: true,
  description: true,
  category: true,
  priority: true,
  affected: true,
}).extend({
  /** Justificativa da prioridade, exibida no rascunho junto do prazo. */
  priorityReason: z.string(),
});
export type TicketDraft = z.infer<typeof TicketDraft>;

export const HelpArticle = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  category: Category,
});
export type HelpArticle = z.infer<typeof HelpArticle>;
