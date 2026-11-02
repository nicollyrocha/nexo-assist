import { PRIORITY_LABELS, TICKET_STATUS_LABELS, type Priority, type TicketStatus } from "@nexo/shared";

export const STATUS_DOT: Record<TicketStatus, string> = {
  aberto: "bg-status-aberto",
  em_andamento: "bg-status-andamento",
  aguardando_analista: "bg-status-aguardando",
  aguardando_funcionario: "bg-status-voce",
  aprovado: "bg-status-aprovado",
  resolvido: "bg-status-encerrado",
  fechado: "bg-status-encerrado",
};

/** Ponto de status (6 ou 7px). Sempre acompanhado do rótulo escrito. */
export function StatusDot({ status, size = 6 }: { status: TicketStatus; size?: 6 | 7 }) {
  return <span aria-hidden="true" className={`${size === 7 ? "size-1.75" : "size-1.5"} shrink-0 rounded-full ${STATUS_DOT[status]}`} />;
}

export function StatusLabel({ status, className = "text-meta font-medium text-ink-secondary" }: { status: TicketStatus; className?: string }) {
  const tone =
    status === "aguardando_analista"
      ? "text-warning-ink"
      : status === "aguardando_funcionario"
        ? "text-primary-ink font-semibold"
        : "";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className} ${tone}`}>
      <StatusDot status={status} />
      {TICKET_STATUS_LABELS[status]}
    </span>
  );
}

const PRIORITY_DOT: Record<Priority, string> = {
  critica: "bg-prioridade-critica",
  alta: "bg-prioridade-alta",
  media: "bg-prioridade-media",
  // Anel: diferencia Baixa de Média sem depender de cor (tokens.md, prioridade).
  baixa: "border-[1.5px] border-prioridade-baixa",
};

export function PriorityDot({ priority, size = 6 }: { priority: Priority; size?: 6 | 7 }) {
  return <span aria-hidden="true" className={`${size === 7 ? "size-1.75" : "size-1.5"} shrink-0 rounded-full ${PRIORITY_DOT[priority]}`} />;
}

export function PriorityValue({ priority }: { priority: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <PriorityDot priority={priority} />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
