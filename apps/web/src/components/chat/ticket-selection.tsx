"use client";

import { TICKET_STATUS_LABELS, isOverdue, type Ticket } from "@nexo/shared";
import { StatusDot } from "@/components/ui/dots";
import { formatShortDate } from "@/lib/format";
import { CardShell } from "./ticket-card";

type Props = {
  tickets: Ticket[];
  prompt: string;
  /** Id escolhido (pela mensagem seguinte do funcionário). */
  chosen: string | null;
  interactive: boolean;
  now: Date;
  onChoose: (text: string) => void;
};

/** Seleção de chamado (bloco `ticket_selection`, Tela 3): cada linha é um botão que envia "{id} · {título}". */
export function TicketSelection({ tickets, prompt, chosen, interactive, now, onChoose }: Props) {
  return (
    <CardShell aria-label={prompt}>
      <ul>
        {tickets.map((t, i) => {
          const overdue = isOverdue(t.dueAt ? new Date(t.dueAt) : null, now);
          const selected = chosen === t.id;
          const disabled = !interactive || chosen !== null;
          const status = `${TICKET_STATUS_LABELS[t.status]}${overdue ? ", vencido" : ""}`;
          return (
            <li key={t.id} className={i > 0 ? "border-t border-border-subtle" : ""}>
              <button
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                aria-label={`Ver ${t.id}, ${t.title}, ${status}`}
                onClick={() => onChoose(`${t.id} · ${t.title}`)}
                className={`group grid w-full grid-cols-[auto_auto_1fr_auto] items-center gap-x-3.5 gap-y-1 px-4 py-3 text-left sm:flex sm:h-11.5 sm:py-0 ${
                  selected ? "bg-primary-hover-row" : ""
                } enabled:cursor-pointer enabled:hover:bg-primary-hover-row enabled:focus-visible:bg-primary-hover-row focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary disabled:cursor-default`}
              >
                <span
                  aria-hidden="true"
                  className={`size-4 shrink-0 rounded-full bg-surface ${
                    selected ? "border-[5px] border-primary" : "border-[1.5px] border-radio-off group-enabled:group-hover:border-[5px] group-enabled:group-hover:border-primary group-enabled:group-focus-visible:border-[5px] group-enabled:group-focus-visible:border-primary"
                  }`}
                />
                <span className="text-meta/natural font-medium text-muted sm:shrink-0">{t.id}</span>
                <span className="col-span-4 row-start-2 truncate text-body font-medium text-ink sm:flex-1">{t.title}</span>
                <span className="col-span-4 row-start-3 inline-flex items-center gap-1.5 whitespace-nowrap text-meta text-muted sm:row-auto">
                  <StatusDot status={t.status} />
                  {TICKET_STATUS_LABELS[t.status]}
                  {overdue && <span className="text-prazo-vencido"> · vencido</span>}
                </span>
                <span className="col-start-4 row-start-1 text-right text-meta text-muted sm:w-11">{formatShortDate(t.openedAt)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </CardShell>
  );
}
