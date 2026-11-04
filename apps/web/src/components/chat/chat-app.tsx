"use client";

import {
  ApiErrorBody,
  ConversationView,
  isAgentPaused,
  type ChatStreamEvent,
  type DecisionTrace,
  type MessageView,
  type TraceAction,
} from "@nexo/shared";
import { ArrowDown, ChevronRight, Menu } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { Viewer } from "@/lib/viewer";
import { BrandMark } from "@/components/ui/brand-mark";
import { DayPill, SystemDivider } from "@/components/ui/system-divider";
import { ApiError, apiRequest, goToLogin } from "@/lib/api";
import { draftStatus, DRAFT_PHRASES } from "@/lib/conversation-state";
import { dayKey, firstName, formatDayLabel, formatTime } from "@/lib/format";
import { readChatStream } from "@/lib/sse";
import { chipText } from "@/lib/trace-copy";
import { useNow } from "@/lib/use-platform";
import { ChatDrawer, ChatSidebar } from "./chat-sidebar";
import { Composer, type ComposerHandle } from "./composer";
import type { DraftAction } from "./draft-card";
import { AgentErrorBlock, AgentMessage, AnalystMessage, EmployeeBubble, LiveAgentTurn, type BlockContext } from "./messages";
import {
  AgentPausedNotice,
  ChatSkeleton,
  ClosedNotice,
  EmptyState,
  LoadError,
  SessionCounter,
  SessionLimitNotice,
  StatusPill,
} from "./notices";

type LiveTurn = {
  text: string;
  phase: "sending" | "streaming" | "reconnecting" | "failed_send" | "error";
  savedId: string | null;
  actions: TraceAction[];
  reply: string;
  errorCode: string | null;
  slow: boolean;
  draft?: { messageId: string; action: DraftAction };
};

const POLL_MS = 3_000;
const SLOW_MS = 20_000;
const NEAR_BOTTOM = 120;
const RESUME_GAP_MS = 60 * 60_000;

const inFlight = (t: LiveTurn | null) => !!t && (t.phase === "sending" || t.phase === "streaming" || t.phase === "reconnecting");

export function ChatApp({ user }: { user: Viewer }) {
  const [view, setView] = useState<ConversationView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [turn, setTurn] = useState<LiveTurn | null>(null);
  const [limitHit, setLimitHit] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [showJump, setShowJump] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [resumeAfterId, setResumeAfterId] = useState<string | null>(null);
  const now = useNow(30_000);
  const counterId = useId();

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const composerRef = useRef<ComposerHandle>(null);
  const viewRef = useRef<ConversationView | null>(null);
  const slowTimer = useRef<number | null>(null);
  // Leituras de GET /api/chat que saíram antes de um envio são descartadas ao voltar.
  const viewSeq = useRef(0);
  useLayoutEffect(() => {
    viewRef.current = view;
  }, [view]);

  // ---- Carga e sincronização ------------------------------------------------------------------

  const announceNew = useCallback((prev: ConversationView | null, next: ConversationView) => {
    if (!prev) return;
    const known = new Set(prev.messages.map((m) => m.id));
    const fresh = next.messages.filter((m) => !known.has(m.id) && m.role === "analista");
    const last = fresh.at(-1);
    if (last) setAnnouncement(`${last.authorName}: ${last.content}`);
  }, []);

  const refresh = useCallback(async () => {
    const seq = viewSeq.current;
    try {
      const next = await apiRequest("/api/chat", ConversationView);
      if (seq !== viewSeq.current) return null;
      announceNew(viewRef.current, next);
      setView(next);
      setLoadError(false);
      if (next.messagesUsed >= next.messagesLimit) setLimitHit(true);
      return next;
    } catch (error) {
      if (!viewRef.current && !(error instanceof ApiError && error.code === "unauthorized")) setLoadError(true);
      return null;
    }
  }, [announceNew]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const first = await refresh();
      if (!alive || !first) return;
      const last = first.messages.at(-1);
      if (last && Date.now() - new Date(last.createdAt).getTime() > RESUME_GAP_MS) setResumeAfterId(last.id);
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  const status = view?.conversation.status ?? "ativa";
  const paused = isAgentPaused(status);

  // Polling enquanto a conversa está com analista (o agent não responde; quem responde é a pessoa).
  useEffect(() => {
    if (!paused || inFlight(turn)) return;
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [paused, turn, refresh]);

  // ---- Envio e streaming ----------------------------------------------------------------------

  const bumpSlow = useCallback(() => {
    if (slowTimer.current) window.clearTimeout(slowTimer.current);
    slowTimer.current = window.setTimeout(() => setTurn((t) => (t && t.phase === "streaming" ? { ...t, slow: true } : t)), SLOW_MS);
  }, []);

  const stopSlow = () => {
    if (slowTimer.current) window.clearTimeout(slowTimer.current);
    slowTimer.current = null;
  };

  /** Conexão caiu no meio: o servidor termina o turno mesmo assim; relê até a resposta aparecer. */
  const reconcile = useCallback(
    async (savedId: string | null) => {
      setTurn((t) => (t ? { ...t, phase: "reconnecting" } : t));
      for (let attempt = 0; attempt < 6; attempt++) {
        await new Promise((r) => window.setTimeout(r, 2_000));
        const next = await refresh();
        if (!next) continue;
        const idx = savedId ? next.messages.findIndex((m) => m.id === savedId) : -1;
        const answered = idx >= 0 && next.messages.slice(idx + 1).some((m) => m.role !== "funcionario");
        if (answered || isAgentPaused(next.conversation.status)) {
          setTurn(null);
          return;
        }
      }
      setTurn((t) => (t ? { ...t, phase: "error", errorCode: "unavailable" } : t));
    },
    [refresh],
  );

  const handleEvent = useCallback(
    (event: ChatStreamEvent, original: string) => {
      bumpSlow();
      switch (event.type) {
        case "saved":
          setView((v) => (v ? { ...v, messages: [...v.messages, event.message], messagesUsed: event.messagesUsed } : v));
          setTurn((t) => (t ? { ...t, phase: "streaming", savedId: event.message.id } : t));
          stickRef.current = true;
          break;
        case "action":
          setTurn((t) => (t ? { ...t, actions: [...t.actions, event.action] } : t));
          setAnnouncement(`O assistente ${chipText(event.action)}`);
          break;
        case "text":
          setTurn((t) => (t ? { ...t, reply: t.reply + event.delta } : t));
          break;
        case "done":
          stopSlow();
          setView((v) =>
            v
              ? {
                  ...v,
                  conversation: event.conversation,
                  messages: [...v.messages, event.message],
                  traces: { ...v.traces, [event.trace.id]: event.trace },
                }
              : v,
          );
          setTurn(null);
          // Transferência gera eventos de sistema e muda quem atende: relê a conversa.
          if (event.conversation.status !== "ativa") void refresh();
          break;
        case "paused":
          stopSlow();
          setView((v) => (v ? { ...v, conversation: event.conversation } : v));
          setTurn(null);
          void refresh();
          break;
        case "error":
          stopSlow();
          if (event.error.code === "limit_reached") {
            setLimitHit(true);
            setTurn((t) => {
              if (t && !t.savedId) setDraftText(original);
              return null;
            });
          } else if (event.error.code === "agent_paused") {
            setTurn(null);
            void refresh();
          } else if (event.error.code === "unauthorized") {
            goToLogin();
          } else {
            setTurn((t) => (t ? { ...t, phase: t.savedId ? "error" : "failed_send", errorCode: event.error.code } : t));
          }
          break;
      }
    },
    [bumpSlow, refresh],
  );

  const send = useCallback(
    async (text: string, draft?: { messageId: string; action: DraftAction }) => {
      const clean = text.trim();
      if (!clean || inFlight(turn) || limitHit) return;
      stickRef.current = true;
      viewSeq.current++;
      setTurn({ text: clean, phase: "sending", savedId: null, actions: [], reply: "", errorCode: null, slow: false, draft });
      bumpSlow();
      let res: Response;
      try {
        res = await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "text/event-stream" },
          body: JSON.stringify({ text: clean }),
        });
      } catch {
        stopSlow();
        setTurn((t) => (t ? { ...t, phase: "failed_send" } : t));
        return;
      }
      if (res.status === 401) {
        goToLogin();
        return;
      }
      if (!res.ok || !res.body) {
        stopSlow();
        const body = ApiErrorBody.safeParse(await res.json().catch(() => null));
        const code = body.success ? body.data.error.code : "internal";
        if (code === "limit_reached") {
          setLimitHit(true);
          setTurn(null);
          setDraftText(clean);
        } else {
          setTurn((t) => (t ? { ...t, phase: "failed_send", errorCode: code } : t));
        }
        return;
      }
      let savedId: string | null = null;
      const outcome = await readChatStream(res.body, (event) => {
        if (event.type === "saved") savedId = event.message.id;
        handleEvent(event, clean);
      });
      if (outcome === "interrupted") void reconcile(savedId);
    },
    [turn, limitHit, bumpSlow, handleEvent, reconcile],
  );

  useEffect(() => () => stopSlow(), []);

  const submitComposer = () => {
    const text = draftText;
    setDraftText("");
    void send(text);
    composerRef.current?.focus();
  };

  const startNew = async () => {
    setCreatingNew(true);
    try {
      const next = await apiRequest("/api/chat/new", ConversationView, { method: "POST" });
      setView(next);
      setResumeAfterId(null);
    } catch {
      // mantém a conversa encerrada; o botão volta a ficar disponível
    } finally {
      setCreatingNew(false);
    }
  };

  // ---- Rolagem --------------------------------------------------------------------------------

  const messageCount = view?.messages.length ?? 0;
  const liveLength = (turn?.reply.length ?? 0) + (turn?.actions.length ?? 0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickRef.current) {
      el.scrollTop = el.scrollHeight;
      setShowJump(false);
    } else {
      setShowJump(true);
    }
  }, [messageCount, liveLength, turn?.phase]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM;
    stickRef.current = near;
    if (near) setShowJump(false);
  };

  const jumpToEnd = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setShowJump(false);
  };

  // ---- Derivados ------------------------------------------------------------------------------

  const messages = view?.messages ?? NO_MESSAGES;
  const traces = view?.traces ?? NO_TRACES;
  const atLimit = limitHit || (!!view && view.messagesUsed >= view.messagesLimit);
  const closed = status === "encerrada";
  const busy = inFlight(turn);
  const canAct = !!view && !busy && !paused && !atLimit && !closed;
  const latestAgentIndex = messages.findLastIndex((m) => m.role === "agent");
  const disabledNote = paused
    ? "O assistente está pausado enquanto o analista atende."
    : atLimit
      ? "Para confirmar, saia e entre de novo para começar outra sessão."
      : null;

  const pendingDraft = findPendingDraft(messages, traces);

  const ctx: BlockContext = {
    messages,
    traces,
    now,
    canAct,
    latestAgentIndex,
    disabledNote,
    busyDraft: turn?.draft && busy ? turn.draft : null,
    onSend: (text, draft) => void send(text, draft),
  };

  const showEmpty = !!view && messages.length === 0 && !turn;
  const unsavedTurn = turn && !turn.savedId ? turn : null;

  return (
    <div className="flex h-dvh overflow-clip bg-surface">
      <ChatSidebar user={user} />
      <ChatDrawer user={user} open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle px-4 md:h-topbar md:gap-4 md:px-8">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu"
            className="-ml-2 flex size-10 items-center justify-center rounded-control text-ink-secondary hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:hidden"
          >
            <Menu aria-hidden="true" className="size-5" />
          </button>
          <span className="flex flex-1 items-center gap-2 md:hidden">
            <BrandMark className="h-4.5 w-5 fill-brand-mark" />
            <span className="text-brand font-bold text-ink">Nexo Assist</span>
          </span>
          <nav aria-label="Você está em" className="hidden flex-1 md:block">
            <ol className="flex items-center gap-2 text-ui">
              <li className="text-muted">Service desk de TI</li>
              <li aria-hidden="true">
                <ChevronRight className="size-3.5 text-muted" />
              </li>
              <li aria-current="page" className="font-semibold text-ink">
                Atendimento
              </li>
            </ol>
          </nav>
          {view && <StatusPill status={status} analystName={view.analystName} />}
        </header>

        <main className="relative flex min-h-0 flex-1 flex-col">
          <h1 className="sr-only">Atendimento</h1>
          <div role="status" aria-live="polite" className="sr-only">
            {announcement}
          </div>

          <div ref={scrollRef} onScroll={onScroll} className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="relative mx-auto flex w-full max-w-chat-column flex-1 flex-col px-4 pt-4 md:px-8 md:pt-7 2xl:left-11.5 2xl:px-0">
              {!view && !loadError && <ChatSkeleton />}
              {!view && loadError && <LoadError onRetry={() => void refresh()} />}
              {showEmpty && <EmptyState firstName={firstName(user.name)} onPick={(t) => void send(t)} disabled={!canAct} />}
              {view && !showEmpty && (
                <div className="flex flex-1 flex-col justify-end gap-4 pb-1 md:gap-5">
                  <div role="log" aria-live="polite" aria-relevant="additions" aria-label="Mensagens" className="flex flex-col gap-4 md:gap-5">
                    {messages.map((m, i) => (
                      <MessageRow
                        key={m.id}
                        message={m}
                        index={i}
                        prev={messages[i - 1]}
                        now={now}
                        ctx={ctx}
                        analystTier={view.analystTier}
                        resumeAfter={resumeAfterId === m.id}
                      />
                    ))}
                  </div>
                  {unsavedTurn && (
                    <EmployeeBubble
                      text={unsavedTurn.text}
                      state={unsavedTurn.phase === "failed_send" ? "failed" : "sending"}
                      onRetry={() => void send(unsavedTurn.text, unsavedTurn.draft)}
                    />
                  )}
                  {turn && turn.savedId && (turn.phase === "streaming" || turn.phase === "reconnecting") && (
                    <LiveAgentTurn actions={turn.actions} reply={turn.reply} slow={turn.slow || turn.phase === "reconnecting"} />
                  )}
                  {turn && turn.phase === "error" && (
                    <AgentErrorBlock code={turn.errorCode ?? "internal"} onRetry={() => void send(turn.text, turn.draft)} />
                  )}
                </div>
              )}
            </div>
          </div>

          {showJump && (
            <button
              type="button"
              onClick={jumpToEnd}
              className="absolute bottom-32 left-1/2 inline-flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full bg-surface px-3 text-meta font-medium text-ink shadow-popover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Novas mensagens
              <ArrowDown aria-hidden="true" className="size-3.5" />
            </button>
          )}

          <div className="relative mx-auto w-full max-w-chat-column shrink-0 px-4 pt-2.5 pb-[max(12px,env(safe-area-inset-bottom))] md:px-8 md:pb-4.5 2xl:left-11.5 2xl:px-0">
            {atLimit && view ? (
              <SessionLimitNotice limit={view.messagesLimit} />
            ) : closed && view ? (
              <ClosedNotice byName={view.analystName} time={formatTime(view.conversation.updatedAt)} onNew={() => void startNew()} busy={creatingNew} />
            ) : (
              <>
                {view && paused && (
                  <AgentPausedNotice status={status as "aguardando_atendente" | "em_atendimento"} analystName={view.analystName} />
                )}
                <Composer
                  ref={composerRef}
                  value={draftText}
                  onChange={setDraftText}
                  onSubmit={submitComposer}
                  sending={busy}
                  disabled={!view}
                  placeholder={!view ? "Carregando a conversa…" : paused ? "Escreva para o analista…" : "Escreva para o Nexo…"}
                  label={paused ? "Mensagem para o analista" : "Mensagem para o Nexo Assist"}
                  describedBy={paused ? `paused-notice ${counterId}` : counterId}
                  onConfirmShortcut={pendingDraft && canAct ? () => void send(pendingDraft.text, { messageId: pendingDraft.messageId, action: "confirm" }) : undefined}
                  meta={view ? <SessionCounter used={view.messagesUsed} limit={view.messagesLimit} id={counterId} /> : null}
                />
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

const NO_MESSAGES: MessageView[] = [];
const NO_TRACES: Record<string, DecisionTrace> = {};

/** Rascunho pendente mais recente (atalho Ctrl/⌘+Enter no composer vazio). */
function findPendingDraft(messages: MessageView[], traces: Record<string, DecisionTrace>) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const block = m.blocks.find((b) => b.kind === "draft" || b.kind === "update_draft");
    if (!block) continue;
    const st = draftStatus(messages, traces, i);
    if (st.kind !== "pending" && st.kind !== "failed") return null;
    const text =
      block.kind === "draft"
        ? DRAFT_PHRASES.confirm
        : block.reopen
          ? DRAFT_PHRASES.confirmReopen(block.ticket.id)
          : DRAFT_PHRASES.confirmUpdate(block.ticket.id);
    return { messageId: m.id, text };
  }
  return null;
}

function MessageRow({
  message,
  index,
  prev,
  now,
  ctx,
  analystTier,
  resumeAfter,
}: {
  message: MessageView;
  index: number;
  prev: MessageView | undefined;
  now: Date;
  ctx: BlockContext;
  analystTier: string | null;
  resumeAfter: boolean;
}) {
  const newDay = !prev || dayKey(prev.createdAt) !== dayKey(message.createdAt);
  const time = formatTime(message.createdAt);
  let body;
  if (message.role === "funcionario") body = <EmployeeBubble text={message.content} time={time} />;
  else if (message.role === "agent") body = <AgentMessage message={message} index={index} ctx={ctx} />;
  else if (message.role === "analista") body = <AnalystMessage message={message} tier={analystTier} />;
  else {
    const event = message.blocks.find((b) => b.kind === "event");
    body = <SystemDivider text={event?.kind === "event" ? event.text : message.content} time={time} />;
  }
  return (
    <>
      {newDay && <DayPill label={formatDayLabel(message.createdAt, now)} />}
      {body}
      {resumeAfter && <SystemDivider text="Você voltou · continuamos de onde paramos" icon="history" />}
    </>
  );
}
