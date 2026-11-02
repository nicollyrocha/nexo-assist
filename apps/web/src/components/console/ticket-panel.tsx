"use client";

import { CATEGORY_LABELS, PRIORITY_LABELS, TICKET_STATUS_LABELS, isOpenStatus, isOverdue, type ConsoleConversation, type Ticket } from "@nexo/shared";
import { ArrowRightLeft, ArrowUpRight, Bot, ChevronRight, Clock, ClockAlert, CloudOff, Headset, X } from "lucide-react";
import { useState } from "react";
import { STATUS_DOT, StatusDot } from "@/components/ui/dots";
import { btnSecondary } from "@/components/chat/draft-card";
import { firstName, formatAgo, formatDateTime, formatDeadline, formatShortDate, formatTime } from "@/lib/format";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const STATUS_TONE: Partial<Record<Ticket["status"], string>> = {
  aguardando_analista: "text-warning-ink",
  em_andamento: "text-primary-ink",
  aberto: "text-primary-ink",
  aguardando_funcionario: "text-primary-ink",
};

function plural(n: number, one: string, many: string) {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

function Deadline({ ticket, now }: { ticket: Ticket; now: Date }) {
  if (!ticket.dueAt) return null;
  const due = new Date(ticket.dueAt);
  if (isOverdue(due, now)) {
    return (
      <p className="flex items-center gap-1.5 text-ui font-medium text-prazo-vencido">
        <ClockAlert aria-hidden="true" className="size-3.5" />
        Prazo vencido {formatAgo(due, now)}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-ui text-muted">
      <Clock aria-hidden="true" className="size-3.5" />
      Resposta {formatDeadline(due, now)}
    </p>
  );
}

function FocusCard({ detail, now }: { detail: ConsoleConversation; now: Date }) {
  const ticket = detail.tickets.find((t) => t.id === detail.conversation.ticketId);
  if (!ticket) return <p className="text-ui text-muted">Nenhum chamado em foco nesta conversa.</p>;
  const st = detail.conversation.status;
  const event =
    st === "aguardando_atendente"
      ? { Icon: ArrowRightLeft, text: "Transferido para um analista" }
      : st === "em_atendimento"
        ? { Icon: Headset, text: `Assumido por ${detail.analystName ?? "um analista"}` }
        : { Icon: Bot, text: "Com o agent" };
  return (
    <div id={`ticket-${ticket.id}`} className="flex flex-col gap-3.5 rounded-bubble bg-surface-subtle p-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-meta font-medium text-muted">{ticket.id}</span>
          <span className={`inline-flex items-center gap-1.5 text-meta font-semibold ${STATUS_TONE[ticket.status] ?? "text-ink-secondary"}`}>
            <StatusDot status={ticket.status} size={7} />
            {TICKET_STATUS_LABELS[ticket.status]}
          </span>
        </div>
        <h3 className="text-body-lg/5 font-semibold text-ink">{ticket.title}</h3>
        <p className="text-ui text-muted">
          {CATEGORY_LABELS[ticket.category]} · prioridade {PRIORITY_LABELS[ticket.priority].toLowerCase()}
        </p>
        <Deadline ticket={ticket} now={now} />
      </div>
      <div className="flex items-center gap-2 border-t border-border-subtle pt-3">
        <event.Icon aria-hidden="true" className="size-3.75 shrink-0 text-muted" />
        <span className="flex-1 text-ui text-ink-secondary">{event.text}</span>
        <span className="text-meta text-muted tabular-nums">{formatTime(detail.conversation.updatedAt)}</span>
      </div>
    </div>
  );
}

function OtherTicket({ ticket, now, last }: { ticket: Ticket; now: Date; last: boolean }) {
  const [open, setOpen] = useState(false);
  const overdue = isOverdue(ticket.dueAt ? new Date(ticket.dueAt) : null, now);
  const closed = !isOpenStatus(ticket.status);
  return (
    <li className={last ? "" : "border-b border-border-subtle"}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-3 py-3 text-left ${focusRing}`}
      >
        <span aria-hidden="true" className={`size-1.75 shrink-0 rounded-full ${STATUS_DOT[ticket.status]}`} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.75">
          <span className="text-body font-medium text-ink">{ticket.title}</span>
          <span className="text-meta text-muted">
            {ticket.id} ·{" "}
            {closed && ticket.resolvedAt ? `Resolvido em ${formatShortDate(ticket.resolvedAt)}` : TICKET_STATUS_LABELS[ticket.status]}
            {overdue && <span className="text-prazo-vencido"> · vencido</span>}
          </span>
        </span>
        <ChevronRight aria-hidden="true" className={`size-4 shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 pb-3 pl-4.75 text-ui text-ink-secondary">
          <p>{ticket.description}</p>
          <p className="text-meta text-muted">
            Prioridade {PRIORITY_LABELS[ticket.priority]} · {CATEGORY_LABELS[ticket.category]} · aberto em {formatDateTime(ticket.openedAt)}
          </p>
          <Deadline ticket={ticket} now={now} />
        </div>
      )}
    </li>
  );
}

const sortOthers = (a: Ticket, b: Ticket, now: Date) => {
  const ao = isOpenStatus(a.status);
  const bo = isOpenStatus(b.status);
  if (ao !== bo) return ao ? -1 : 1;
  if (ao) {
    const av = isOverdue(a.dueAt ? new Date(a.dueAt) : null, now);
    const bv = isOverdue(b.dueAt ? new Date(b.dueAt) : null, now);
    if (av !== bv) return av ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  }
  return (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? "");
};

/** Painel "Chamados do funcionário" (Telas 4–5). */
export function TicketPanel({
  detail,
  loading,
  now,
  onClose,
  onRetry,
}: {
  detail: ConsoleConversation | null;
  loading: boolean;
  now: Date;
  onClose: () => void;
  onRetry: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const name = detail ? firstName(detail.employee.name) : "";
  const tickets = detail?.tickets ?? [];
  const open = tickets.filter((t) => isOpenStatus(t.status)).length;
  const others = tickets.filter((t) => t.id !== detail?.conversation.ticketId).sort((a, b) => sortOthers(a, b, now));
  const visibleOthers = showAll ? others : others.slice(0, 5);

  return (
    <aside aria-label={detail ? `Chamados de ${detail.employee.name}` : "Chamados do funcionário"} className="flex h-full min-h-0 w-full flex-col bg-surface">
      <div className="flex h-topbar shrink-0 items-center gap-2 border-b border-border-subtle pr-3.5 pl-5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-body-lg font-semibold text-ink">{detail ? `Chamados de ${name}` : "Chamados"}</h2>
          {detail?.ticketsAvailable && (
            <p className="text-meta text-muted">
              {open === 0 ? "nenhum aberto" : plural(open, "aberto", "abertos")} · {plural(tickets.length - open, "encerrado", "encerrados")}
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar painel de chamados" className={`flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface-subtle ${focusRing}`}>
          <X aria-hidden="true" className="size-4.5" />
        </button>
      </div>

      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-5 pt-6 pb-5">
        {loading && !detail && (
          <div aria-busy="true" className="flex animate-pulse flex-col gap-4">
            <div className="h-32 rounded-bubble bg-surface-subtle" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 rounded-control bg-surface-subtle" />
            ))}
          </div>
        )}
        {detail && !detail.ticketsAvailable && (
          <div role="alert" className="flex flex-col gap-2.5 rounded-bubble bg-warning-tint p-3.5 text-ui text-warning-ink">
            <p className="flex gap-2.5">
              <CloudOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              Não consegui carregar os chamados agora. O sistema de chamados não respondeu.
            </p>
            <button type="button" className={`${btnSecondary} self-start`} onClick={onRetry}>
              Tentar de novo
            </button>
          </div>
        )}
        {detail && detail.ticketsAvailable && tickets.length === 0 && <p className="text-ui text-muted">{name} ainda não tem chamados.</p>}
        {detail && detail.ticketsAvailable && tickets.length > 0 && (
          <>
            <section className="flex flex-col gap-3">
              <h3 className="text-meta font-semibold text-muted">Desta conversa</h3>
              <FocusCard detail={detail} now={now} />
            </section>
            {others.length > 0 && (
              <section className="flex flex-col gap-1">
                <h3 className="text-meta font-semibold text-muted">Outros chamados</h3>
                <ul>
                  {visibleOthers.map((t, i) => (
                    <OtherTicket key={t.id} ticket={t} now={now} last={i === visibleOthers.length - 1} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
      {detail && others.length > 5 && (
        <div className="flex shrink-0 px-4 pt-3 pb-4">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-control text-ui font-medium text-ink-secondary outline-1 -outline-offset-1 outline-border-control drop-shadow-soft hover:bg-surface-subtle ${focusRing}`}
          >
            {showAll ? "Mostrar menos" : `Ver todos os chamados de ${name}`}
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      )}
    </aside>
  );
}
