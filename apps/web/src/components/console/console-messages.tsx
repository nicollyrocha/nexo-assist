"use client";

import {
  AFFECTED_LABELS,
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
  isOverdue,
  type ConsoleConversation,
  type MessageBlock,
  type MessageView,
} from "@nexo/shared";
import { FileText } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { StatusDot } from "@/components/ui/dots";
import { RichText } from "@/components/ui/rich-text";
import { DayPill, SystemDivider } from "@/components/ui/system-divider";
import { ActionChips } from "@/components/trace/action-chips";
import { ConfidenceBadge } from "@/components/trace/confidence";
import { DecisionDetails } from "@/components/trace/decision-details";
import { draftStatus, eventIcon } from "@/lib/conversation-state";
import { dayKey, formatDayLabel, formatDeadline, formatTime } from "@/lib/format";
import { TRANSFER_REASON_LABELS, buildChips } from "@/lib/trace-copy";
import type { Viewer } from "@/lib/viewer";

function Time({ iso }: { iso: string }) {
  return <span className="shrink-0 pb-px text-tiny text-muted tabular-nums">{formatTime(iso)}</span>;
}

function Bubble({ text, iso, tone, tail }: { text: string; iso: string; tone: "employee" | "agent" | "analyst"; tail: "tl" | "tr" | null }) {
  const bg = tone === "employee" ? "bg-surface" : tone === "agent" ? "bg-bubble-agent" : "bg-bubble-analyst";
  const tailCls = tail === "tl" ? "rounded-tl-tail" : tail === "tr" ? "rounded-tr-tail" : "";
  const long = text.length > 48 || text.includes("\n");
  return (
    <div
      className={`flex max-w-[85%] gap-2.5 rounded-bubble px-3 pt-2 pb-1.5 shadow-bubble md:max-w-bubble-console ${bg} ${tailCls} ${
        long ? "flex-col gap-0.5" : "items-end"
      }`}
    >
      {tone === "agent" ? (
        <RichText text={text} className="flex min-w-0 flex-col gap-2 break-words text-body text-ink" />
      ) : (
        <p className="min-w-0 whitespace-pre-wrap break-words text-body text-ink">{text}</p>
      )}
      <span className={long ? "self-end" : ""}>
        <Time iso={iso} />
      </span>
    </div>
  );
}

function CompactBlock({ block, messages, detail, index, now }: { block: MessageBlock; messages: MessageView[]; detail: ConsoleConversation; index: number; now: Date }) {
  const box = "w-full max-w-[85%] md:max-w-bubble-console rounded-bubble bg-surface p-3 text-ui text-ink outline-1 -outline-offset-1 outline-border-subtle";
  switch (block.kind) {
    case "ticket_cards":
      return (
        <ul className={`${box} flex flex-col gap-2`}>
          {block.tickets.map((t) => {
            const overdue = isOverdue(t.dueAt ? new Date(t.dueAt) : null, now);
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-meta font-medium text-muted">{t.id}</span>
                {/* Largura mínima: status e prazo quebram para a linha de baixo em vez de esmagar o título. */}
                <span className="min-w-48 flex-1 truncate">{t.title}</span>
                <span className="inline-flex items-center gap-1.5 text-meta text-muted">
                  <StatusDot status={t.status} />
                  {TICKET_STATUS_LABELS[t.status]}
                </span>
                {t.dueAt && (
                  <span className={`text-meta ${overdue ? "text-prazo-vencido" : "text-muted"}`}>
                    {overdue ? "prazo vencido" : `resposta ${formatDeadline(t.dueAt, now)}`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      );
    case "ticket_selection":
      return <p className={box}>Pediu para escolher entre: {block.tickets.map((t) => t.id).join(", ")}</p>;
    case "draft": {
      const st = draftStatus(messages, detail.traces, index);
      const state =
        st.kind === "created"
          ? `Criado como ${st.ticketId ?? "chamado"}`
          : st.kind === "superseded"
            ? "Substituído"
            : st.kind === "cancelled"
              ? "Cancelado"
              : st.kind === "failed"
                ? "Falhou ao criar — aguardando nova confirmação"
                : "Aguardando confirmação";
      const d = block.draft;
      return (
        <div className={`${box} flex flex-col gap-1`}>
          <p className="font-medium">Rascunho: {d.title}</p>
          <p className="text-meta text-muted">
            {TICKET_TYPE_LABELS[d.type]} · {CATEGORY_LABELS[d.category]} · {PRIORITY_LABELS[d.priority]} · resposta {formatDeadline(block.dueAtPreview, now)} ·{" "}
            {AFFECTED_LABELS[d.affected]}
          </p>
          <p className={`text-meta font-medium ${st.kind === "created" ? "text-success-ink" : st.kind === "pending" || st.kind === "failed" ? "text-warning-ink" : "text-muted"}`}>
            {state}
          </p>
        </div>
      );
    }
    case "update_draft":
      return (
        <div className={`${box} flex flex-col gap-1`}>
          <p>
            {block.reopen ? "Reabrir" : "Complementar"} {block.ticket.id}: “{block.comment}”
          </p>
          {(block.newPriority || block.reopen) && (
            <p className="text-meta text-muted">
              {block.newPriority && `Prioridade ${PRIORITY_LABELS[block.ticket.priority]} → ${PRIORITY_LABELS[block.newPriority]}`}
              {block.newPriority && block.reopen && " · "}
              {block.reopen && "Reabrir"}
            </p>
          )}
        </div>
      );
    case "quick_replies":
      return <p className="max-w-bubble-console text-right text-meta text-muted">Opções oferecidas: {block.options.join(" · ")}</p>;
    case "event":
      return null;
  }
}

function AgentTurn({ message, index, detail, now }: { message: MessageView; index: number; detail: ConsoleConversation; now: Date }) {
  const trace = message.traceId ? detail.traces[message.traceId] ?? null : null;
  const detailsId = useId();
  const buttonId = useId();
  const [open, setOpen] = useState(trace?.confidence.level === "baixa");
  const chips = trace ? buildChips(trace.actions, message.blocks, trace.outcome) : [];
  return (
    <article aria-label={`Nexo Assist, ${formatTime(message.createdAt)}`} className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-1.5 px-1">
        <span className="text-caption font-semibold text-ink-secondary">Nexo Assist</span>
        <span className="rounded-tag bg-primary-tint px-1.5 py-px text-tiny font-semibold text-primary-ink">IA</span>
        {trace && <ConfidenceBadge confidence={trace.confidence} />}
      </div>
      {trace && (
        <div className="max-w-full px-1 md:max-w-[560px]">
          <ActionChips chips={chips} align="end" details={{ id: detailsId, buttonId, open, onToggle: () => setOpen((v) => !v) }} />
        </div>
      )}
      {trace && open && <DecisionDetails trace={trace} blocks={message.blocks} audience="analyst" id={detailsId} labelledBy={buttonId} />}
      {message.content.trim() && <Bubble text={message.content} iso={message.createdAt} tone="agent" tail="tr" />}
      {message.blocks.map((b, i) => (
        <CompactBlock key={i} block={b} messages={detail.messages} detail={detail} index={index} now={now} />
      ))}
    </article>
  );
}

function CaseSummary({ detail, onFocusTicket }: { detail: ConsoleConversation; onFocusTicket: (id: string) => void }) {
  const c = detail.conversation;
  if (!c.summary && !c.transferReason) return null;
  return (
    <section aria-label="Resumo do caso para o analista" className="mx-auto mt-2 flex w-full max-w-[560px] flex-col gap-2 rounded-bubble bg-surface p-3.5 outline-1 -outline-offset-1 outline-border-subtle">
      <h3 className="flex items-center gap-1.5 text-meta font-semibold text-muted">
        <FileText aria-hidden="true" className="size-3.5" />
        Resumo do caso para o analista
      </h3>
      {c.transferReason && <p className="text-ui font-medium text-ink">Motivo: {TRANSFER_REASON_LABELS[c.transferReason]}</p>}
      {c.summary && <p className="whitespace-pre-wrap text-ui text-ink-secondary">{c.summary}</p>}
      {c.ticketId && (
        <p className="text-ui text-ink-secondary">
          Chamado em foco:{" "}
          <button type="button" onClick={() => onFocusTicket(c.ticketId!)} className="rounded-tag font-medium text-primary-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            {c.ticketId}
          </button>
        </p>
      )}
    </section>
  );
}

const isTransferMarker = (m: MessageView) =>
  (m.role === "sistema" && eventIcon(m.content) === "transfer") ||
  m.blocks.some((b) => b.kind === "event" && eventIcon(b.text) === "transfer");

/** Histórico da conversa no console (bolhas, chips + detalhe completo, divisórias e resumo do caso). */
export function ConsoleMessages({ detail, me, now, onFocusTicket }: { detail: ConsoleConversation; me: Viewer; now: Date; onFocusTicket: (id: string) => void }) {
  const { messages } = detail;
  let lastTransfer = -1;
  messages.forEach((m, i) => {
    if (isTransferMarker(m)) lastTransfer = i;
  });
  const summaryAt = lastTransfer >= 0 ? lastTransfer : detail.conversation.transferReason ? messages.length - 1 : -1;

  const rows: ReactNode[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    if (!prev || dayKey(prev.createdAt) !== dayKey(m.createdAt)) {
      rows.push(<DayPill key={`day-${m.id}`} label={formatDayLabel(m.createdAt, now)} className="bg-day-pill" />);
    }
    const sameAuthor = !!prev && prev.role === m.role && prev.authorId === m.authorId && m.role !== "sistema";
    const spacing = sameAuthor ? "pt-0.75" : "pt-4";
    if (m.role === "funcionario") {
      rows.push(
        <article key={m.id} aria-label={`${m.authorName}, ${formatTime(m.createdAt)}`} className={`flex justify-start ${spacing}`}>
          <Bubble text={m.content} iso={m.createdAt} tone="employee" tail={sameAuthor ? null : "tl"} />
        </article>,
      );
    } else if (m.role === "agent") {
      rows.push(
        <div key={m.id} className={spacing}>
          <AgentTurn message={m} index={i} detail={detail} now={now} />
        </div>,
      );
      for (const b of m.blocks) {
        if (b.kind === "event") rows.push(<SystemDivider key={`${m.id}-ev`} text={b.text} time={formatTime(m.createdAt)} className="pt-4.5 pb-1" />);
      }
    } else if (m.role === "analista") {
      const mine = m.authorId === me.userId;
      const tier = mine ? me.detail : m.authorId === detail.conversation.assignedAnalystId ? detail.analystTier : null;
      rows.push(
        <article key={m.id} aria-label={`${mine ? "Você" : m.authorName}, ${formatTime(m.createdAt)}`} className={`flex flex-col items-end gap-1 ${spacing}`}>
          {!sameAuthor && (
            <div className="flex items-center gap-1.5 px-1">
              <span className="text-caption font-semibold text-ink-secondary">{mine ? "Você" : m.authorName}</span>
              <span className="rounded-tag bg-success-tint px-1.5 py-px text-tiny font-semibold text-success-ink">{tier ? `Suporte ${tier}` : "Analista"}</span>
            </div>
          )}
          <Bubble text={m.content} iso={m.createdAt} tone="analyst" tail={sameAuthor ? null : "tr"} />
        </article>,
      );
    } else {
      const ev = m.blocks.find((b) => b.kind === "event");
      rows.push(<SystemDivider key={m.id} text={ev?.kind === "event" ? ev.text : m.content} time={formatTime(m.createdAt)} className="pt-4.5 pb-1" />);
    }
    if (i === summaryAt) rows.push(<CaseSummary key="summary" detail={detail} onFocusTicket={onFocusTicket} />);
  });

  return <>{rows}</>;
}
