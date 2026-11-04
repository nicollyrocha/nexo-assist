"use client";

import { CATEGORY_LABELS, REOPEN_WINDOW_DAYS, isOverdue, type Ticket } from "@nexo/shared";
import { useId, useState, type ReactNode } from "react";
import { PriorityValue, StatusLabel } from "@/components/ui/dots";
import { formatAgo, formatDateTime, formatDeadline, formatShortDate } from "@/lib/format";

export function CardShell({ children, className = "", ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      {...rest}
      className={`w-full overflow-hidden rounded-card bg-surface shadow-card outline-1 -outline-offset-1 outline-border-card ${className}`}
    >
      {children}
    </section>
  );
}

export function Eyebrow({ left, right }: { left: ReactNode[]; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-0.5 text-meta/natural">
      {left.map((node, i) => (
        <span key={i} className="flex items-center gap-2 whitespace-nowrap">
          {i > 0 && <span aria-hidden="true" className="size-0.75 rounded-full bg-border-subtle" />}
          {node}
        </span>
      ))}
      <span className="flex-1" />
      <span className="whitespace-nowrap">{right}</span>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-meta/natural text-muted">{label}</dt>
      <dd className="text-body/natural font-medium text-ink">{children}</dd>
    </div>
  );
}

const DAY = 86_400_000;

function LastUpdate({ ticket, now }: { ticket: Ticket; now: Date }) {
  if (!ticket.dueAt) return <>{formatAgo(ticket.updatedAt, now)}</>;
  const overdue = isOverdue(new Date(ticket.dueAt), now);
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 sm:flex-nowrap sm:whitespace-nowrap">
      <span className={overdue ? "text-prazo-vencido" : ""}>{formatAgo(ticket.updatedAt, now)}</span>
      <span className="text-ui/natural font-normal text-muted">{overdue ? "· prazo vencido" : `· resposta ${formatDeadline(ticket.dueAt, now)}`}</span>
    </span>
  );
}

/** Cartão de chamado (bloco `ticket_cards`, Tela 3). Informativo, não clicável. */
export function TicketCard({ ticket, now }: { ticket: Ticket; now: Date }) {
  const titleId = useId();
  const [expanded, setExpanded] = useState(false);
  const long = ticket.description.length > 220;
  const resolved = !ticket.dueAt && ticket.resolvedAt;
  const reopenUntil = resolved ? new Date(new Date(ticket.resolvedAt!).getTime() + REOPEN_WINDOW_DAYS * DAY) : null;

  return (
    <CardShell aria-labelledby={titleId}>
      <div className="flex flex-col gap-1.5 px-4 pt-4 pb-3.5 sm:px-4.5">
        <Eyebrow
          left={[
            <span key="t" className="text-meta font-medium text-muted">Chamado</span>,
            <span key="n" className="text-meta text-muted">{ticket.id}</span>,
          ]}
          right={<StatusLabel status={ticket.status} />}
        />
        <h3 id={titleId} className="text-base/5.25 font-semibold text-ink sm:text-card-title">
          {ticket.title}
        </h3>
        <p className={`text-ui text-ink-secondary ${long && !expanded ? "line-clamp-3" : ""}`}>{ticket.description}</p>
        {long && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="self-start rounded-tag text-meta font-medium text-primary-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {expanded ? "Ver menos" : "Ver mais"}
          </button>
        )}
      </div>
      <div className="px-4 pb-4 sm:px-4.5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-3 sm:grid-cols-4 sm:gap-6">
          <Field label="Categoria">{CATEGORY_LABELS[ticket.category]}</Field>
          <Field label="Prioridade">
            <PriorityValue priority={ticket.priority} />
          </Field>
          <Field label="Aberto em">{formatDateTime(ticket.openedAt)}</Field>
          {resolved ? (
            <Field label="Resolvido em">
              <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
                {formatShortDate(ticket.resolvedAt!)}
                {reopenUntil && reopenUntil.getTime() > now.getTime() && (
                  <span className="text-ui font-normal text-muted">· dá para reabrir até {formatShortDate(reopenUntil)}</span>
                )}
              </span>
            </Field>
          ) : (
            <Field label="Última atualização">
              <LastUpdate ticket={ticket} now={now} />
            </Field>
          )}
        </dl>
      </div>
    </CardShell>
  );
}

export function TicketCards({ tickets, now }: { tickets: Ticket[]; now: Date }) {
  const [all, setAll] = useState(false);
  const visible = all ? tickets : tickets.slice(0, 3);
  return (
    <div className="flex w-full flex-col gap-2">
      {visible.map((t) => (
        <TicketCard key={t.id} ticket={t} now={now} />
      ))}
      {tickets.length > 3 && !all && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="self-start rounded-tag text-ui font-medium text-primary-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Ver mais {tickets.length - 3} chamados
        </button>
      )}
    </div>
  );
}
