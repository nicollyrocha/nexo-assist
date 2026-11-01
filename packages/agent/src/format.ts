import {
  AFFECTED_LABELS,
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  REOPEN_WINDOW_DAYS,
  SERVICE_DESK_TZ,
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
  isOpenStatus,
  isOverdue,
  type HelpArticle,
  type Ticket,
  type TicketWithEvents,
} from "@nexo/shared";

// Como os dados chegam ao modelo: compactos, em português e com o prazo já interpretado pelo
// código (o modelo nunca calcula vencimento).

const DAY = 24 * 3_600_000;

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SERVICE_DESK_TZ,
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const shortDateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SERVICE_DESK_TZ,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatNow = (now: Date) => `${dateTime.format(now)} (horário de Brasília)`;
const at = (iso: string) => shortDateTime.format(new Date(iso));

const daysAgo = (iso: string, now: Date) => {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);
  return days <= 0 ? "hoje" : days === 1 ? "há 1 dia" : `há ${days} dias`;
};

export function deadlineSituation(ticket: Ticket, now: Date): string {
  if (!isOpenStatus(ticket.status)) {
    if (ticket.status === "resolvido" && ticket.resolvedAt) {
      const limit = new Date(new Date(ticket.resolvedAt).getTime() + REOPEN_WINDOW_DAYS * DAY);
      return now < limit
        ? `resolvido; pode ser reaberto até ${shortDateTime.format(limit)}`
        : "resolvido há mais de 7 dias; não pode mais ser reaberto";
    }
    return "fechado";
  }
  if (!ticket.dueAt) return "sem prazo definido";
  return isOverdue(new Date(ticket.dueAt), now)
    ? `VENCIDO desde ${at(ticket.dueAt)}`
    : `no prazo; próxima resposta até ${at(ticket.dueAt)}`;
}

export function ticketForModel(ticket: Ticket, now: Date) {
  return {
    codigo: ticket.id,
    tipo: TICKET_TYPE_LABELS[ticket.type],
    titulo: ticket.title,
    categoria: CATEGORY_LABELS[ticket.category],
    prioridade: PRIORITY_LABELS[ticket.priority],
    afetados: AFFECTED_LABELS[ticket.affected],
    status: TICKET_STATUS_LABELS[ticket.status],
    equipe: ticket.assignedTeam,
    aberto_em: at(ticket.openedAt),
    ultima_atualizacao: daysAgo(ticket.updatedAt, now),
    prazo: deadlineSituation(ticket, now),
  };
}

export function ticketDetailForModel(ticket: TicketWithEvents, now: Date) {
  return {
    ...ticketForModel(ticket, now),
    descricao: ticket.description,
    historico: ticket.events.map((e) => `${at(e.createdAt)} (${e.authorKind}): ${e.body}`),
  };
}

export const articleForModel = (a: HelpArticle) => ({ id: a.id, titulo: a.title, texto: a.body });
