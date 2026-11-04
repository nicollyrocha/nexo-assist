"use client";

import {
  AFFECTED,
  CATEGORIES,
  CATEGORY_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  TICKET_TYPES,
  TICKET_TYPE_LABELS,
  computeDueAt,
  type Affected,
  type MessageBlock,
} from "@nexo/shared";
import { Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { PriorityValue } from "@/components/ui/dots";
import { adjustDraftMessage, DRAFT_PHRASES, type DraftEdits, type DraftStatus } from "@/lib/conversation-state";
import { formatDeadline } from "@/lib/format";
import { useShortcutLabel } from "@/lib/use-platform";
import { CardShell, Eyebrow, Field } from "./ticket-card";

type DraftBlock = Extract<MessageBlock, { kind: "draft" }>;

/** "Afetados" em 2ª pessoa, como no protótipo. */
export const AFFECTED_YOU: Record<Affected, string> = {
  so_eu: "Somente você",
  minha_equipe: "Sua equipe",
  empresa: "A empresa toda",
};

export type DraftAction = "confirm" | "adjust" | "cancel";

type Props = {
  block: DraftBlock;
  status: DraftStatus;
  /** false quando o turno está em streaming, o agent está pausado ou a sessão atingiu o limite. */
  enabled: boolean;
  /** Motivo exibido na barra quando desabilitado por pausa/limite. */
  disabledNote?: string | null;
  busy: DraftAction | null;
  now: Date;
  onAction: (action: DraftAction, text: string) => void;
};

export function DraftStateTag({ status, pendingLabel = "Aguardando confirmação" }: { status: DraftStatus; pendingLabel?: string }) {
  if (status.kind === "created") {
    const label =
      status.verb === "criado" ? `Criado como ${status.ticketId ?? "chamado"}` : status.verb === "atualizado" ? "Atualizado" : "Reaberto";
    return <Tag dot="bg-success" text="text-success-ink">{label}</Tag>;
  }
  if (status.kind === "superseded") return <Tag dot="bg-status-encerrado" text="text-muted">Substituído por um rascunho novo</Tag>;
  if (status.kind === "cancelled") return <Tag dot="bg-status-encerrado" text="text-muted">Cancelado — nada foi criado</Tag>;
  return <Tag dot="bg-warning" text="text-warning-ink">{pendingLabel}</Tag>;
}

function Tag({ dot, text, children }: { dot: string; text: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-right text-meta font-medium ${text}`}>
      <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

export function FailureAlert({ attempts }: { attempts: number }) {
  return (
    <div role="alert" className="mx-4 mb-3 flex gap-2.5 rounded-control bg-warning-tint p-3 text-ui text-warning-ink sm:mx-4.5">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>
        O sistema de chamados não respondeu{attempts > 1 ? ` (${attempts} tentativas)` : ""}. <strong className="font-semibold">Nada foi criado.</strong>{" "}
        Tente confirmar de novo em instantes.
      </p>
    </div>
  );
}

const btnBase =
  "inline-flex h-9 items-center justify-center gap-2 rounded-control text-ui/natural enabled:cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-55";
export const btnPrimary = `${btnBase} bg-primary pl-3.5 pr-2.5 font-semibold text-white enabled:hover:bg-primary-hover enabled:active:bg-primary-active`;
export const btnSecondary = `${btnBase} bg-surface px-3.5 font-medium text-ink shadow-button outline-1 -outline-offset-1 outline-border-control enabled:hover:bg-surface-subtle`;
export const btnGhost = `${btnBase} px-3.5 font-medium text-ink-secondary enabled:hover:bg-surface`;
const inputBase =
  "w-full rounded-control bg-surface text-ink outline-1 -outline-offset-1 outline-border-control focus:outline-[1.5px] focus:outline-primary";

export function ShortcutHint() {
  const label = useShortcutLabel();
  return (
    <span aria-hidden="true" className="hidden rounded-tag bg-white/14 px-1.25 py-px text-micro text-white/80 [@media(hover:hover)]:inline">
      {label}
    </span>
  );
}

const isShortcut = (e: KeyboardEvent) => e.key === "Enter" && (e.ctrlKey || e.metaKey);

/** Rascunho de chamado (bloco `draft`, Tela 2): conferir, ajustar no próprio card e confirmar. */
export function DraftCard({ block, status, enabled, disabledNote, busy, now, onAction }: Props) {
  const titleId = useId();
  const stateId = useId();
  const { draft } = block;
  const original: DraftEdits = {
    title: draft.title,
    description: draft.description,
    type: draft.type,
    category: draft.category,
    priority: draft.priority,
    affected: draft.affected,
  };
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<DraftEdits>(original);
  const adjustRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const open = status.kind === "pending" || status.kind === "failed";
  const finished = status.kind === "created";
  const muted = status.kind === "superseded" || status.kind === "cancelled";
  const actionable = open && enabled && busy === null;
  const adjustText = adjustDraftMessage(original, edits);
  const priorityChanged = edits.priority !== draft.priority;
  const due = editing && priorityChanged ? computeDueAt(edits.priority, now) : new Date(block.dueAtPreview);

  const startEditing = () => {
    setEdits(original);
    setEditing(true);
    requestAnimationFrame(() => firstFieldRef.current?.focus());
  };
  const discard = () => {
    setEditing(false);
    setEdits(original);
    requestAnimationFrame(() => adjustRef.current?.focus());
  };
  const confirm = () => {
    if (actionable) onAction("confirm", DRAFT_PHRASES.confirm);
  };

  const set = <K extends keyof DraftEdits>(key: K, value: DraftEdits[K]) => setEdits((e) => ({ ...e, [key]: value }));
  const fieldLabel = "text-meta text-muted";
  const selectCls = `${inputBase} h-9 cursor-pointer px-2.5 text-ui`;

  return (
    <CardShell
      aria-labelledby={titleId}
      aria-describedby={stateId}
      className={finished ? "opacity-80" : muted ? "opacity-60" : ""}
      onKeyDown={(e) => {
        if (isShortcut(e) && !editing) {
          e.preventDefault();
          confirm();
        }
      }}
    >
      <div className="flex flex-col gap-1.5 px-4 pt-4 pb-3.5 sm:px-4.5">
        <Eyebrow
          left={[
            <span key="n" className="text-meta font-medium text-muted">Novo chamado</span>,
            <span key="r" className="text-meta text-muted">Rascunho</span>,
            <span key="t" className="text-meta text-muted">{TICKET_TYPE_LABELS[draft.type]}</span>,
          ]}
          right={
            <span id={stateId}>
              <DraftStateTag status={status} />
            </span>
          }
        />
        {editing ? (
          <div className="flex flex-col gap-3 pt-1">
            <label className="flex flex-col gap-1">
              <span className={fieldLabel}>Título</span>
              <input
                ref={firstFieldRef}
                value={edits.title}
                maxLength={200}
                onChange={(e) => set("title", e.target.value)}
                className={`${inputBase} h-10 px-3 text-body font-semibold`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={fieldLabel}>Descrição</span>
              <textarea
                value={edits.description}
                rows={4}
                onChange={(e) => set("description", e.target.value)}
                className={`${inputBase} min-h-20 resize-y px-3 py-2 text-ui`}
              />
            </label>
          </div>
        ) : (
          <>
            <h3 id={titleId} className="text-base/5.25 font-semibold text-ink sm:text-card-title">
              {draft.title}
            </h3>
            <p className="whitespace-pre-wrap text-ui text-ink-secondary">{draft.description}</p>
          </>
        )}
        {editing && <h3 id={titleId} className="sr-only">Ajustar rascunho: {draft.title}</h3>}
      </div>

      <div className="px-4 pb-4 sm:px-4.5">
        {editing ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-3 sm:grid-cols-4 sm:gap-6">
            <label className="flex flex-col gap-1">
              <span className={fieldLabel}>Tipo</span>
              <select value={edits.type} onChange={(e) => set("type", e.target.value as DraftEdits["type"])} className={selectCls}>
                {TICKET_TYPES.map((t) => (
                  <option key={t} value={t}>{TICKET_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={fieldLabel}>Categoria</span>
              <select value={edits.category} onChange={(e) => set("category", e.target.value as DraftEdits["category"])} className={selectCls}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-1">
              <label className="flex flex-col gap-1">
                <span className={fieldLabel}>Prioridade</span>
                <select value={edits.priority} onChange={(e) => set("priority", e.target.value as DraftEdits["priority"])} className={selectCls}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                  ))}
                </select>
              </label>
              <span className="text-ui text-muted" aria-live="polite">
                resposta {formatDeadline(due, now)}
              </span>
            </div>
            <label className="flex flex-col gap-1">
              <span className={fieldLabel}>Afetados</span>
              <select value={edits.affected} onChange={(e) => set("affected", e.target.value as DraftEdits["affected"])} className={selectCls}>
                {AFFECTED.map((a) => (
                  <option key={a} value={a}>{AFFECTED_YOU[a]}</option>
                ))}
              </select>
            </label>
            {priorityChanged && (
              <p className="col-span-full text-meta text-muted">O assistente vai reavaliar a prioridade com base no impacto e na urgência.</p>
            )}
          </div>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-3 sm:grid-cols-3 sm:gap-6">
              <Field label="Categoria">{CATEGORY_LABELS[draft.category]}</Field>
              <Field label="Prioridade">
                <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
                  <PriorityValue priority={draft.priority} />
                  <span className="text-ui/natural font-normal text-muted">· resposta {formatDeadline(due, now)}</span>
                </span>
              </Field>
              <Field label="Afetados">{AFFECTED_YOU[draft.affected]}</Field>
            </dl>
            {draft.priorityReason && (
              <p className="flex gap-1.5 pt-2.5 text-ui text-ink-secondary">
                <Info aria-hidden="true" className="mt-0.75 size-3.5 shrink-0 text-muted" />
                <span>
                  Por que {PRIORITY_LABELS[draft.priority]}: {draft.priorityReason}
                </span>
              </p>
            )}
          </>
        )}
      </div>

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
                onClick={confirm}
                aria-label={status.kind === "failed" ? "Tentar confirmar de novo" : "Confirmar e criar o chamado"}
                aria-keyshortcuts="Control+Enter Meta+Enter"
              >
                {busy === "confirm" && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
                {busy === "confirm" ? "Criando…" : status.kind === "failed" ? "Tentar de novo" : "Confirmar"}
                {busy !== "confirm" && <ShortcutHint />}
              </button>
              <button
                ref={adjustRef}
                type="button"
                className={btnSecondary}
                disabled={!actionable}
                onClick={startEditing}
                aria-label="Ajustar o rascunho"
              >
                Editar
              </button>
              <button
                type="button"
                className={btnGhost}
                disabled={!actionable}
                onClick={() => onAction("cancel", DRAFT_PHRASES.cancel)}
                aria-label="Cancelar o rascunho"
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
