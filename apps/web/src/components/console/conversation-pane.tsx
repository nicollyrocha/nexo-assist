"use client";

import { type ConsoleConversation } from "@nexo/shared";
import {
  ArrowLeft,
  Bot,
  CircleCheck,
  CircleCheckBig,
  EllipsisVertical,
  Hand,
  Headset,
  LoaderCircle,
  MessagesSquare,
  PanelRight,
  SendHorizontal,
  Users,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { btnPrimary, btnSecondary } from "@/components/chat/draft-card";
import { firstName, formatAgo, formatTime } from "@/lib/format";
import type { Viewer } from "@/lib/viewer";
import { ConsoleMessages } from "./console-messages";
import { Avatar } from "./conversation-list";

export type ConsoleActionKind = "claim" | "return" | "close";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const ACTION_BUSY: Record<ConsoleActionKind, string> = { claim: "Assumindo…", return: "Devolvendo…", close: "Encerrando…" };

type Props = {
  detail: ConsoleConversation | null;
  state: "idle" | "loading" | "error" | "not_found";
  me: Viewer;
  now: Date;
  busy: ConsoleActionKind | null;
  banner: string | null;
  onDismissBanner: () => void;
  onAction: (kind: ConsoleActionKind) => void;
  onSend: (text: string) => Promise<boolean>;
  onRetry: () => void;
  onBack: () => void;
  onOpenPanel: () => void;
  onFocusTicket: (id: string) => void;
  composerFocusKey: number;
  /** Painel fixo visível a partir de 1440px (o botão "Chamados" só aparece se estiver recolhido). */
  panelPinned: boolean;
};

function ModePill({ detail, mine }: { detail: ConsoleConversation; mine: boolean }) {
  const st = detail.conversation.status;
  const map: Record<string, { Icon: typeof Bot; text: string; cls: string }> = {
    aguardando_atendente: { Icon: Bot, text: "Aguardando atendente", cls: "bg-warning-tint text-warning-ink" },
    ativa: { Icon: Bot, text: "Com o agent", cls: "bg-primary-tint text-primary-ink" },
    em_atendimento: mine
      ? { Icon: Headset, text: "Você está atendendo", cls: "bg-success-tint text-success-ink" }
      : { Icon: Headset, text: `Com ${detail.analystName ?? "outro analista"}`, cls: "bg-surface-subtle text-ink-secondary" },
    encerrada: { Icon: CircleCheck, text: "Encerrada", cls: "bg-surface-subtle text-ink-secondary" },
  };
  const m = map[st];
  return (
    <span role="status" className={`hidden shrink-0 items-center gap-1.75 rounded-full px-2.75 py-1.5 text-meta font-semibold sm:inline-flex ${m.cls}`}>
      <m.Icon aria-hidden="true" className="size-3.5" />
      {m.text}
    </span>
  );
}

function ActionButton({ kind, busy, variant, compact, onClick }: { kind: ConsoleActionKind; busy: ConsoleActionKind | null; variant: "primary" | "secondary" | "danger"; compact?: boolean; onClick: () => void }) {
  const label = kind === "claim" ? "Assumir atendimento" : kind === "return" ? "Devolver ao agent" : "Encerrar atendimento";
  const Icon = kind === "claim" ? Headset : kind === "return" ? Bot : CircleCheckBig;
  const cls =
    variant === "primary"
      ? `${btnPrimary} gap-1.75 pr-4 pl-3.5`
      : variant === "danger"
        ? `inline-flex h-9 items-center justify-center gap-1.5 rounded-control bg-danger-tint pr-3 pl-2.5 text-ui font-semibold text-danger-ink enabled:hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-55 ${focusRing}`
        : `${btnSecondary} drop-shadow-soft shadow-none ${compact ? "gap-1.5 pr-3 pl-2.5" : "gap-1.75 pr-3.5 pl-3"} text-ink-secondary`;
  return (
    <button type="button" className={cls} disabled={busy !== null} onClick={onClick}>
      {busy === kind ? (
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      ) : (
        <Icon aria-hidden="true" className={`${compact || variant === "danger" ? "size-3.5" : variant === "primary" ? "size-4" : "size-3.75"} ${variant === "secondary" ? "text-ink-secondary" : ""}`} />
      )}
      {busy === kind ? ACTION_BUSY[kind] : label}
    </button>
  );
}

function CloseDialog({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => void }) {
  const backRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    backRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Tab" && boxRef.current) {
        const items = Array.from(boxRef.current.querySelectorAll<HTMLElement>("button"));
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-ink/40" onClick={onCancel} />
      <div
        ref={boxRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="close-title"
        aria-describedby="close-desc"
        className="relative flex w-full max-w-[400px] flex-col gap-3 rounded-card bg-surface p-5 shadow-popover"
      >
        <h2 id="close-title" className="text-body-lg font-semibold text-ink">
          Encerrar o atendimento?
        </h2>
        <p id="close-desc" className="text-ui text-ink-secondary">
          {name} vai ver que a conversa foi encerrada. Os chamados dela não mudam.
        </p>
        <div className="mt-2 flex justify-end gap-2">
          <button ref={backRef} type="button" className={btnSecondary} onClick={onCancel}>
            Voltar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`inline-flex h-9 items-center rounded-control bg-danger px-3.5 text-ui font-semibold text-white hover:bg-danger-ink ${focusRing}`}
          >
            Encerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function ConsoleComposer({ placeholder, disabled, describedBy, onSend, focusKey }: { placeholder: string; disabled: boolean; describedBy?: string; onSend: (text: string) => Promise<boolean>; focusKey: number }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 21 * 6 + 24)}px`;
  }, [text]);

  useEffect(() => {
    if (focusKey > 0 && !disabled) ref.current?.focus();
  }, [focusKey, disabled]);

  const submit = async (value: string) => {
    const clean = value.trim();
    if (!clean || sending || disabled) return;
    setSending(true);
    setFailed(null);
    setText("");
    const ok = await onSend(clean);
    setSending(false);
    if (!ok) {
      setFailed(clean);
      setText(clean);
    }
    ref.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit(text);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {failed && (
        <p role="alert" className="text-right text-meta text-danger-ink">
          Não foi enviada.{" "}
          <button type="button" onClick={() => void submit(failed)} className={`rounded-tag font-semibold underline ${focusRing}`}>
            Tentar de novo
          </button>
        </p>
      )}
      <form
        className="flex items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(text);
        }}
      >
        <div className={`flex min-h-11 flex-1 items-center rounded-bubble bg-surface-subtle px-3.5 focus-within:outline-[1.5px] focus-within:outline-primary ${disabled ? "opacity-55" : ""}`}>
          <label htmlFor="console-composer" className="sr-only">
            Mensagem para o funcionário
          </label>
          <textarea
            id="console-composer"
            ref={ref}
            rows={1}
            value={text}
            disabled={disabled}
            placeholder={placeholder}
            aria-describedby={describedBy}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={2000}
            className="w-full resize-none bg-transparent py-3 text-body text-ink placeholder:text-muted focus:outline-none disabled:cursor-not-allowed"
          />
        </div>
        {!disabled && (
          <button
            type="submit"
            aria-label="Enviar mensagem"
            disabled={sending}
            className={`flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-white enabled:hover:bg-primary-hover disabled:opacity-55 ${focusRing}`}
          >
            {sending ? <LoaderCircle aria-hidden="true" className="size-4.5 animate-spin" /> : <SendHorizontal aria-hidden="true" className="size-4.5" />}
          </button>
        )}
      </form>
    </div>
  );
}

function TakeoverBar({ icon, iconCls, title, body, children }: { icon: ReactNode; iconCls: string; title: string; body: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span aria-hidden="true" className={`flex size-9 shrink-0 items-center justify-center rounded-full ${iconCls}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-body font-semibold text-ink">{title}</p>
          <p id="takeover-body" className="text-meta text-muted">
            {body}
          </p>
        </div>
      </div>
      {children && <div className="flex flex-col-reverse gap-2 md:flex-row md:gap-2.5 [&>button]:w-full md:[&>button]:w-auto">{children}</div>}
    </div>
  );
}

/** Conversa aberta no console (Telas 4–5). */
export function ConversationPane({ detail, state, me, now, busy, banner, onDismissBanner, onAction, onSend, onRetry, onBack, onOpenPanel, onFocusTicket, composerFocusKey, panelPinned }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const count = detail?.messages.length ?? 0;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count, detail?.conversation.id]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    const onDown = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [menuOpen]);

  if (state === "idle" && !detail) {
    return (
      <div className="hidden h-full flex-1 flex-col items-center justify-center gap-1.5 bg-surface-thread px-6 text-center lg:flex">
        <MessagesSquare aria-hidden="true" className="size-7 text-muted" />
        <p className="text-body font-semibold text-ink">Escolha uma conversa</p>
        <p className="text-ui text-muted">As que precisam de você estão em Para você.</p>
      </div>
    );
  }

  const backButton = (
    <button type="button" onClick={onBack} aria-label="Voltar para a lista" className={`-ml-2 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-secondary hover:bg-surface-subtle lg:hidden ${focusRing}`}>
      <ArrowLeft aria-hidden="true" className="size-4.5" />
    </button>
  );

  if (!detail) {
    return (
      <main className="flex h-full min-w-0 flex-1 flex-col bg-surface-thread">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle bg-surface px-4 md:h-topbar md:pr-4 md:pl-5">
          {backButton}
          {state === "loading" && (
            <div className="flex animate-pulse items-center gap-3">
              <span className="size-10 rounded-full bg-surface-subtle" />
              <span className="h-4 w-40 rounded-full bg-surface-subtle" />
            </div>
          )}
        </div>
        {state === "loading" ? (
          <div aria-busy="true" aria-label="Carregando a conversa" className="flex flex-1 animate-pulse flex-col justify-end gap-4 px-4 pb-6 md:px-10">
            <div className="h-10 w-60 rounded-bubble bg-surface" />
            <div className="h-16 w-90 max-w-full self-end rounded-bubble bg-bubble-agent" />
            <div className="h-10 w-48 rounded-bubble bg-surface" />
            <div className="h-16 w-80 max-w-full self-end rounded-bubble bg-bubble-agent" />
          </div>
        ) : (
          <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-body font-medium text-ink">
              {state === "not_found" ? "Esta conversa não existe ou não está mais disponível." : "Não consegui abrir esta conversa."}
            </p>
            <button type="button" className={btnSecondary} onClick={state === "not_found" ? onBack : onRetry}>
              {state === "not_found" ? "Voltar para a lista" : "Tentar de novo"}
            </button>
          </div>
        )}
      </main>
    );
  }

  const c = detail.conversation;
  const name = detail.employee.name;
  const first = firstName(name);
  const mine = c.status === "em_atendimento" && c.assignedAnalystId === me.userId;
  const otherAnalyst = c.status === "em_atendimento" && !mine;
  const waitText = c.status === "aguardando_atendente" ? `esperando ${formatAgo(c.updatedAt, now)}` : null;
  const ticket = detail.tickets.find((t) => t.id === c.ticketId);
  const ticketOverdue = !!ticket?.dueAt && new Date(ticket.dueAt).getTime() < now.getTime();

  const copySummary = async () => {
    setMenuOpen(false);
    const text = [c.summary ?? "", c.ticketId ? `Chamado em foco: ${c.ticketId}` : ""].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text || "Sem resumo registrado.");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // sem permissão de área de transferência: nada a fazer
    }
  };

  let bottom: ReactNode;
  if (c.status === "aguardando_atendente") {
    bottom = (
      <TakeoverBar
        icon={<Hand className="size-4.25" />}
        iconCls="bg-warning-tint text-warning-ink"
        title={`${first} espera um atendente`}
        body={`Agent pausado · ${waitText}${ticketOverdue ? " · chamado vencido" : ""}`}
      >
        <ActionButton kind="return" busy={busy} variant="secondary" onClick={() => onAction("return")} />
        <ActionButton kind="claim" busy={busy} variant="primary" onClick={() => onAction("claim")} />
      </TakeoverBar>
    );
  } else if (c.status === "ativa") {
    bottom = (
      <TakeoverBar icon={<Bot className="size-4.25" />} iconCls="bg-primary-tint text-primary-ink" title={`O agent está atendendo ${first}`} body="Você pode assumir se quiser conduzir a conversa.">
        <ActionButton kind="claim" busy={busy} variant="secondary" onClick={() => onAction("claim")} />
      </TakeoverBar>
    );
  } else if (otherAnalyst) {
    bottom = (
      <TakeoverBar icon={<Headset className="size-4.25" />} iconCls="bg-surface-subtle text-ink-secondary" title={`${detail.analystName ?? "Outro analista"} está atendendo`} body="Só quem assumiu pode responder." />
    );
  } else if (c.status === "encerrada") {
    bottom = (
      <TakeoverBar icon={<CircleCheck className="size-4.25" />} iconCls="bg-surface-subtle text-ink-secondary" title="Conversa encerrada" body={`${detail.analystName ? `Por ${detail.analystName} ` : ""}às ${formatTime(c.updatedAt)}.`} />
    );
  }

  const composerPlaceholder = mine
    ? `Escreva para ${first}…`
    : otherAnalyst
      ? `Só ${firstName(detail.analystName ?? "o analista")} pode responder agora`
      : "Assuma o atendimento para responder";

  return (
    <main aria-labelledby="conversation-title" className="flex h-full min-w-0 flex-1 flex-col bg-surface-thread">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle bg-surface px-4 md:h-topbar md:pr-4 md:pl-5">
        {backButton}
        <span className="md:hidden">
          <Avatar id={detail.employee.id} name={name} size={32} />
        </span>
        <span className="hidden md:block">
          <Avatar id={detail.employee.id} name={name} size={40} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id="conversation-title" className="truncate text-body-lg font-semibold text-ink">
            {name}
          </h2>
          <p className="truncate text-meta text-muted">
            {detail.employee.department}
            {c.ticketId ? ` · ${c.ticketId}` : ""}
          </p>
        </div>
        {mine ? (
          <div className="hidden items-center gap-2 md:flex">
            <ActionButton kind="return" busy={busy} variant="secondary" compact onClick={() => onAction("return")} />
            <ActionButton kind="close" busy={busy} variant="danger" onClick={() => setConfirmClose(true)} />
          </div>
        ) : (
          <ModePill detail={detail} mine={mine} />
        )}
        <button type="button" onClick={onOpenPanel} aria-label="Chamados do funcionário" className={`flex size-9 shrink-0 items-center justify-center rounded-full text-ink-secondary hover:bg-surface-subtle ${panelPinned ? "2xl:hidden" : ""} ${focusRing}`}>
          <PanelRight aria-hidden="true" className="size-4.5" />
        </button>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Mais ações"
            onClick={() => setMenuOpen((v) => !v)}
            className={`flex size-9 items-center justify-center rounded-full text-ink-secondary hover:bg-surface-subtle ${focusRing}`}
          >
            <EllipsisVertical aria-hidden="true" className="size-4.5" />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute top-full right-0 z-30 mt-1 w-56 rounded-bubble bg-surface p-1.5 shadow-popover">
              <button type="button" role="menuitem" onClick={() => void copySummary()} className={`flex h-9 w-full items-center rounded-control px-2.5 text-left text-ui text-ink hover:bg-surface-subtle ${focusRing}`}>
                Copiar resumo do caso
              </button>
              {mine && (
                <>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onAction("return"); }} className={`flex h-9 w-full items-center rounded-control px-2.5 text-left text-ui text-ink hover:bg-surface-subtle md:hidden ${focusRing}`}>
                    Devolver ao agent
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setConfirmClose(true); }} className={`flex h-9 w-full items-center rounded-control px-2.5 text-left text-ui text-danger-ink hover:bg-danger-tint ${focusRing}`}>
                    Encerrar conversa
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {(banner || copied) && (
        <div className="mx-4 mt-3 flex flex-col gap-2 md:mx-10">
          {banner && (
            <div role="alert" className="flex items-start gap-2.5 rounded-control bg-warning-tint p-3 text-ui text-warning-ink">
              <Users aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <p className="flex-1">{banner}</p>
              <button type="button" onClick={onDismissBanner} className={`rounded-tag font-semibold underline ${focusRing}`}>
                Entendi
              </button>
            </div>
          )}
          {copied && (
            <p role="status" className="rounded-control bg-surface px-3 py-2 text-meta text-ink-secondary shadow-popover">
              Resumo copiado.
            </p>
          )}
        </div>
      )}

      <div ref={scrollRef} className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-5 pb-4 md:px-6 xl:px-10">
        <div role="log" aria-live="polite" aria-relevant="additions" aria-label={`Conversa com ${name}`} className="mt-auto flex flex-col">
          <ConsoleMessages detail={detail} me={me} now={now} onFocusTicket={onFocusTicket} />
        </div>
      </div>

      {c.status !== "encerrada" || bottom ? (
        <div className="flex shrink-0 flex-col gap-2.5 border-t border-border-subtle bg-surface px-4 pt-3 pb-3.5 md:px-5">
          {bottom}
          {c.status !== "encerrada" && (
            <ConsoleComposer
              key={c.id}
              placeholder={composerPlaceholder}
              disabled={!mine}
              describedBy={!mine ? "takeover-body" : undefined}
              onSend={onSend}
              focusKey={composerFocusKey}
            />
          )}
        </div>
      ) : null}

      {confirmClose && (
        <CloseDialog
          name={first}
          onCancel={() => setConfirmClose(false)}
          onConfirm={() => {
            setConfirmClose(false);
            onAction("close");
          }}
        />
      )}
    </main>
  );
}
