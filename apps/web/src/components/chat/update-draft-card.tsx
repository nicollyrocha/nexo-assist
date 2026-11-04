"use client";

import { PRIORITIES, PRIORITY_LABELS, type MessageBlock, type Priority } from "@nexo/shared";
import { LoaderCircle } from "lucide-react";
import { useId, useRef, useState } from "react";
import { PriorityDot, StatusLabel } from "@/components/ui/dots";
import { adjustUpdateMessage, DRAFT_PHRASES, type DraftStatus } from "@/lib/conversation-state";
import { calendarDaysBetween, formatAgo } from "@/lib/format";
import { DraftStateTag, FailureAlert, ShortcutHint, btnGhost, btnPrimary, btnSecondary, type DraftAction } from "./draft-card";
import { CardShell, Eyebrow, Field } from "./ticket-card";

type UpdateBlock = Extract<MessageBlock, { kind: "update_draft" }>;

type Props = {
  block: UpdateBlock;
  status: DraftStatus;
  enabled: boolean;
  disabledNote?: string | null;
  busy: DraftAction | null;
  now: Date;
  onAction: (action: DraftAction, text: string) => void;
};

/** Proposta de complementar ou reabrir chamado (bloco `update_draft`, chat.md §3.4). */
export function UpdateDraftCard({ block, status, enabled, disabledNote, busy, now, onAction }: Props) {
  const titleId = useId();
  const stateId = useId();
  const { ticket, reopen } = block;
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState(block.comment);
  const [priority, setPriority] = useState<Priority | "">(block.newPriority ?? "");
  const adjustRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLTextAreaElement>(null);

  const open = status.kind === "pending" || status.kind === "failed";
  const actionable = open && enabled && busy === null;
  const muted = status.kind === "superseded" || status.kind === "cancelled";
  const adjustText = adjustUpdateMessage(
    ticket.id,
    { comment: block.comment, priority: block.newPriority },
    { comment, priority: priority || null, priorityLabel: priority ? PRIORITY_LABELS[priority] : null },
  );
  const confirmText = reopen ? DRAFT_PHRASES.confirmReopen(ticket.id) : DRAFT_PHRASES.confirmUpdate(ticket.id);
  const resolvedDays = ticket.resolvedAt ? calendarDaysBetween(ticket.resolvedAt, now) : null;

  const discard = () => {
    setEditing(false);
    setComment(block.comment);
    setPriority(block.newPriority ?? "");
    requestAnimationFrame(() => adjustRef.current?.focus());
  };

  return (
    <CardShell
      aria-labelledby={titleId}
      aria-describedby={stateId}
      className={status.kind === "created" ? "opacity-80" : muted ? "opacity-60" : ""}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !editing && actionable) {
          e.preventDefault();
          onAction("confirm", confirmText);
        }
      }}
    >
      <div className="flex flex-col gap-1.5 px-4 pt-4 pb-3.5 sm:px-4.5">
        <Eyebrow
          left={[
            <span key="k" className="text-meta font-medium text-muted">{reopen ? "Reabrir chamado" : "Complementar chamado"}</span>,
            <span key="n" className="text-meta text-muted">{ticket.id}</span>,
          ]}
          right={
            <span id={stateId}>
              <DraftStateTag status={status} />
            </span>
          }
        />
        <h3 id={titleId} className="text-base/5.25 font-semibold text-ink sm:text-card-title">
          {ticket.title}
        </h3>
        <StatusLabel status={ticket.status} className="text-meta text-muted" />
        <div className="mt-1 flex flex-col gap-1">
          <span className="text-meta text-muted">O que vou acrescentar</span>
          {editing ? (
            <textarea
              ref={firstRef}
              value={comment}
              rows={4}
              onChange={(e) => setComment(e.target.value)}
              aria-label="O que vou acrescentar"
              className="min-h-20 w-full resize-y rounded-control bg-surface px-3 py-2 text-ui text-ink outline-1 -outline-offset-1 outline-border-control focus:outline-[1.5px] focus:outline-primary"
            />
          ) : (
            <p className="whitespace-pre-wrap border-l-2 border-border-subtle pl-3 text-ui text-ink">{block.comment}</p>
          )}
        </div>
      </div>

      {(block.newPriority || reopen || editing) && (
        <div className="px-4 pb-4 sm:px-4.5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-3 sm:grid-cols-4 sm:gap-6">
            {editing ? (
              <label className="flex flex-col gap-1">
                <span className="text-meta text-muted">Prioridade</span>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority | "")}
                  className="h-9 w-full cursor-pointer rounded-control bg-surface px-2.5 text-ui text-ink outline-1 -outline-offset-1 outline-border-control focus:outline-[1.5px] focus:outline-primary"
                >
                  <option value="">Manter {PRIORITY_LABELS[ticket.priority]}</option>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                  ))}
                </select>
              </label>
            ) : (
              block.newPriority && (
                <Field label="Prioridade">
                  <span className="inline-flex items-center gap-1.5">
                    {PRIORITY_LABELS[ticket.priority]} →
                    <PriorityDot priority={block.newPriority} />
                    <strong className="font-semibold">{PRIORITY_LABELS[block.newPriority]}</strong>
                  </span>
                </Field>
              )
            )}
            {reopen && (
              <div className="col-span-2 flex flex-col gap-1 sm:col-span-3">
                <dt className="text-meta text-muted">Situação</dt>
                <dd className="text-body font-medium text-ink">
                  Resolvido → <strong className="font-semibold">Reaberto</strong>
                  {resolvedDays !== null && (
                    <span className="text-ui font-normal text-muted">
                      {" "}
                      · resolvido {formatAgo(ticket.resolvedAt!, now)}, dentro do limite de 7 dias para reabrir
                    </span>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {status.kind === "failed" && !editing && <FailureAlert attempts={status.attempts} />}

      {open && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border-subtle bg-surface-subtle py-2 pr-3.5 pl-2">
          {editing ? (
            <>
              <button
                type="button"
                className={btnPrimary + " pr-3.5"}
                disabled={!actionable || !adjustText}
                onClick={() => adjustText && onAction("adjust", adjustText)}
              >
                {busy === "adjust" && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
                {busy === "adjust" ? "Enviando…" : "Enviar ajustes"}
              </button>
              <button type="button" className={btnGhost} onClick={discard} disabled={busy !== null}>
                Descartar ajustes
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`${btnPrimary} flex-1 sm:flex-none`}
                disabled={!actionable}
                onClick={() => onAction("confirm", confirmText)}
                aria-keyshortcuts="Control+Enter Meta+Enter"
              >
                {busy === "confirm" && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
                {busy === "confirm"
                  ? "Enviando…"
                  : status.kind === "failed"
                    ? "Tentar de novo"
                    : reopen
                      ? "Confirmar reabertura"
                      : "Confirmar atualização"}
                {busy !== "confirm" && <ShortcutHint />}
              </button>
              <button
                ref={adjustRef}
                type="button"
                className={btnSecondary}
                disabled={!actionable}
                onClick={() => {
                  setEditing(true);
                  requestAnimationFrame(() => firstRef.current?.focus());
                }}
                aria-label={`Ajustar a atualização do ${ticket.id}`}
              >
                Editar
              </button>
              <button
                type="button"
                className={btnGhost}
                disabled={!actionable}
                onClick={() => onAction("cancel", DRAFT_PHRASES.cancelUpdate(ticket.id))}
                aria-label={`Cancelar a atualização do ${ticket.id}`}
              >
                {busy === "cancel" && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
                {busy === "cancel" ? "Cancelando…" : "Cancelar"}
              </button>
            </>
          )}
          {disabledNote && <p className="basis-full px-1.5 pt-1 text-meta text-muted">{disabledNote}</p>}
        </div>
      )}
    </CardShell>
  );
}
