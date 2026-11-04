"use client";

import { ConsoleConversation, ConsoleList, MessageView, type ConsoleFilter } from "@nexo/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/ui/brand-mark";
import { ApiError, apiRequest } from "@/lib/api";
import { STATUS_WORD } from "@/lib/console-copy";
import { useNow } from "@/lib/use-platform";
import type { Viewer } from "@/lib/viewer";
import { ConversationList } from "./conversation-list";
import { ConversationPane, type ConsoleActionKind } from "./conversation-pane";
import { Rail, UserMenu, badgeText } from "./rail";
import { TicketPanel } from "./ticket-panel";

const LIST_POLL_MS = 5_000;
const DETAIL_POLL_MS = 3_000;
const PANEL_PREF = "nexo.console.ticketPanel";

type Toast = { text: string; tone: "info" | "danger"; undo?: () => void } | null;

const VERB: Record<ConsoleActionKind, string> = { claim: "assumir", return: "devolver", close: "encerrar" };

function readPanelPref(): boolean {
  try {
    return window.localStorage.getItem(PANEL_PREF) !== "hidden";
  } catch {
    return true;
  }
}

function changeBanner(next: ConsoleConversation, myId: string): string {
  const c = next.conversation;
  if (c.status === "em_atendimento" && c.assignedAnalystId !== myId) return `${next.analystName ?? "Outro analista"} assumiu esta conversa antes de você.`;
  return `Esta conversa mudou enquanto você olhava: agora está ${STATUS_WORD[c.status]}.`;
}

type Props = { user: Viewer; initialFilter: ConsoleFilter; initialQuery: string; initialId: string | null };

export function ConsoleApp({ user, initialFilter, initialQuery, initialId }: Props) {
  const now = useNow(30_000);
  const [filter, setFilter] = useState<ConsoleFilter>(initialFilter);
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [list, setList] = useState<ConsoleList | null>(null);
  const [listError, setListError] = useState(false);
  const [detail, setDetail] = useState<ConsoleConversation | null>(null);
  const [detailState, setDetailState] = useState<"idle" | "loading" | "error" | "not_found">(initialId ? "loading" : "idle");
  const [busy, setBusy] = useState<ConsoleActionKind | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelPinned, setPanelPinned] = useState(true);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");
  const [composerFocusKey, setComposerFocusKey] = useState(0);

  const detailRef = useRef<ConsoleConversation | null>(null);
  const busyRef = useRef<ConsoleActionKind | null>(null);
  const undoRef = useRef<(base: ConsoleConversation) => void>(() => {});
  const listKeyRef = useRef<string>("");
  const listSeq = useRef(0);
  // Cada leitura/ação da conversa aberta ganha um número; respostas de leituras antigas são
  // descartadas (um polling que saiu antes de "Assumir" não pode desfazer o estado novo).
  const detailSeq = useRef(0);
  const detailInFlight = useRef(false);
  const selectedRef = useRef<string | null>(initialId);
  const knownWaitingRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  // Preferência do painel (só layout; nenhum dado de chamado no navegador).
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setPanelPinned(readPanelPref()));
    return () => window.cancelAnimationFrame(id);
  }, []);

  // Filtro, busca e conversa aberta ficam na URL (searchParams).
  useEffect(() => {
    const params = new URLSearchParams();
    if (filter !== "para_voce") params.set("filter", filter);
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (selectedId) params.set("c", selectedId);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/console?${qs}` : "/console");
  }, [filter, debouncedQuery, selectedId]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  // ---- Lista ------------------------------------------------------------------------------------

  const loadList = useCallback(async () => {
    const key = `${filter}|${debouncedQuery}`;
    const seq = ++listSeq.current;
    const params = new URLSearchParams({ filter });
    if (debouncedQuery) params.set("q", debouncedQuery);
    try {
      const next = await apiRequest(`/api/console/conversations?${params}`, ConsoleList);
      if (seq !== listSeq.current) return; // resposta de um filtro/busca anterior
      // Conversas novas esperando atendimento: destaque de 2 s e anúncio.
      const waiting = new Set(next.conversations.filter((c) => c.status === "aguardando_atendente").map((c) => c.id));
      const known = knownWaitingRef.current;
      if (known && listKeyRef.current === key) {
        const fresh = next.conversations.filter((c) => waiting.has(c.id) && !known.has(c.id));
        if (fresh.length) {
          setHighlighted(new Set(fresh.map((c) => c.id)));
          setAnnouncement(`Nova conversa esperando atendimento: ${fresh[0].employee.name}`);
          window.setTimeout(() => setHighlighted(new Set()), 2_000);
        }
      }
      knownWaitingRef.current = waiting;
      listKeyRef.current = key;
      setList(next);
      setListError(false);
    } catch (error) {
      if (!(error instanceof ApiError && error.code === "unauthorized")) setListError(true);
    }
  }, [filter, debouncedQuery]);

  useEffect(() => {
    let alive = true;
    const tick = () => alive && void loadList();
    tick();
    const id = window.setInterval(tick, LIST_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [loadList]);

  // ---- Conversa aberta ----------------------------------------------------------------------------

  const loadDetail = useCallback(
    async (id: string, opts: { initial?: boolean } = {}) => {
      if (!opts.initial && detailInFlight.current) return; // não empilha polling sobre uma leitura lenta
      const seq = detailSeq.current;
      detailInFlight.current = true;
      try {
        const next = await apiRequest(`/api/console/conversations/${encodeURIComponent(id)}`, ConsoleConversation);
        if (seq !== detailSeq.current || id !== selectedRef.current) return;
        const prev = detailRef.current;
        if (!opts.initial && prev && prev.conversation.id === id && prev.conversation.status !== next.conversation.status && busyRef.current === null) {
          setBanner(changeBanner(next, user.userId));
        }
        if (prev && prev.conversation.id === id) {
          const known = new Set(prev.messages.map((m) => m.id));
          const fresh = next.messages.filter((m) => !known.has(m.id) && m.role === "funcionario").at(-1);
          if (fresh) setAnnouncement(`${next.employee.name}: ${fresh.content}`);
        }
        setDetail(next);
        setDetailState("idle");
      } catch (error) {
        if (!opts.initial || id !== selectedRef.current || detailRef.current) return;
        if (error instanceof ApiError && (error.code === "not_found" || error.code === "forbidden")) setDetailState("not_found");
        else if (!(error instanceof ApiError && error.code === "unauthorized")) setDetailState("error");
      } finally {
        detailInFlight.current = false;
      }
    },
    [user.userId],
  );

  useEffect(() => {
    selectedRef.current = selectedId;
    detailSeq.current++; // trocou de conversa: respostas da anterior não valem mais
    if (!selectedId) return;
    let alive = true;
    const load = (initial: boolean) => alive && void loadDetail(selectedId, { initial });
    load(true);
    const id = window.setInterval(() => load(false), DETAIL_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [selectedId, loadDetail]);

  const select = (id: string) => {
    if (id === selectedId) return;
    setDetail(null);
    setBanner(null);
    setDetailState("loading");
    setSelectedId(id);
  };

  const back = () => {
    setSelectedId(null);
    setDetail(null);
    setDetailState("idle");
    setBanner(null);
  };

  // ---- Ações ----------------------------------------------------------------------------------------

  const showToast = useCallback((next: Toast, ms = 5_000) => {
    setToast(next);
    if (next) window.setTimeout(() => setToast((t) => (t === next ? null : t)), ms);
  }, []);

  const runAction = useCallback(
    async (kind: ConsoleActionKind, base?: ConsoleConversation) => {
      const current = base ?? detailRef.current;
      if (!current || busyRef.current) return;
      setBusy(kind);
      busyRef.current = kind;
      setBanner(null);
      detailSeq.current++;
      try {
        const next = await apiRequest(`/api/console/conversations/${encodeURIComponent(current.conversation.id)}/${kind}`, ConsoleConversation, {
          method: "POST",
          body: { version: current.conversation.version },
        });
        detailSeq.current++;
        setDetail(next);
        detailRef.current = next;
        if (kind === "claim") {
          setComposerFocusKey((k) => k + 1);
          setAnnouncement(`Você assumiu a conversa com ${next.employee.name}. O agent está pausado.`);
        }
        if (kind === "return") {
          showToast({ text: "Conversa devolvida ao agent.", tone: "info", undo: () => undoRef.current(next) });
        }
        if (kind === "close") setAnnouncement("Atendimento encerrado.");
        void loadList();
      } catch (error) {
        if (error instanceof ApiError && (error.code === "conflict" || error.code === "forbidden")) {
          try {
            const fresh = await apiRequest(`/api/console/conversations/${encodeURIComponent(current.conversation.id)}`, ConsoleConversation);
            detailSeq.current++;
            setDetail(fresh);
            detailRef.current = fresh;
            setBanner(changeBanner(fresh, user.userId));
          } catch {
            setBanner("Esta conversa mudou enquanto você olhava. Atualize a lista.");
          }
          void loadList();
        } else if (!(error instanceof ApiError && error.code === "unauthorized")) {
          showToast({ text: `Não consegui ${VERB[kind]}. Tente de novo.`, tone: "danger" });
        }
      } finally {
        setBusy(null);
        busyRef.current = null;
      }
    },
    [loadList, showToast, user.userId],
  );

  useEffect(() => {
    undoRef.current = (base) => void runAction("claim", base);
  }, [runAction]);

  const sendMessage = useCallback(
    async (text: string): Promise<boolean> => {
      const current = detailRef.current;
      if (!current) return false;
      try {
        const message = await apiRequest(`/api/console/conversations/${encodeURIComponent(current.conversation.id)}/messages`, MessageView, {
          method: "POST",
          body: { text },
        });
        detailSeq.current++;
        setDetail((d) => (d && d.conversation.id === current.conversation.id ? { ...d, messages: [...d.messages, message] } : d));
        return true;
      } catch (error) {
        if (error instanceof ApiError && (error.code === "conflict" || error.code === "forbidden")) void loadDetail(current.conversation.id);
        return false;
      }
    },
    [loadDetail],
  );

  const setPanelPref = (visible: boolean) => {
    setPanelPinned(visible);
    try {
      window.localStorage.setItem(PANEL_PREF, visible ? "shown" : "hidden");
    } catch {
      // armazenamento indisponível: vale só nesta visita
    }
  };

  const openPanel = () => {
    setPanelOpen(true);
    setPanelPref(true);
  };
  const closePanel = () => {
    setPanelOpen(false);
    setPanelPref(false);
  };

  const focusTicket = (id: string) => {
    setPanelOpen(true);
    requestAnimationFrame(() => document.getElementById(`ticket-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  const waiting = list?.counts.para_voce ?? 0;
  const showPane = selectedId !== null;
  const panel = <TicketPanel detail={detail} loading={detailState === "loading"} now={now} onClose={closePanel} onRetry={() => selectedId && void loadDetail(selectedId, { initial: true })} />;

  return (
    <div className="flex h-dvh overflow-clip bg-surface">
      <Rail user={user} waiting={waiting} />
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className={`min-h-0 w-full shrink-0 flex-col border-r border-border-subtle lg:flex lg:w-80 xl:w-conv-list ${showPane ? "hidden" : "flex"}`}>
        <ConversationList
          data={list}
          error={listError}
          filter={filter}
          query={query}
          selectedId={selectedId}
          highlighted={highlighted}
          myId={user.userId}
          now={now}
          onFilter={(f) => setFilter(f)}
          onQuery={setQuery}
          onSelect={select}
          onRetry={() => void loadList()}
          header={
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle px-4 md:hidden">
              <BrandMark className="h-4.5 w-5 fill-brand-mark" />
              <h1 className="flex-1 text-body-lg font-bold text-ink">Conversas</h1>
              {waiting > 0 && (
                <span aria-label={`${waiting} para você`} className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-badge font-bold text-white">
                  {badgeText(waiting)}
                </span>
              )}
              <UserMenu user={user} align="right" />
            </div>
          }
        />
      </div>

      <div className={`min-w-0 flex-1 ${showPane ? "flex" : "hidden lg:flex"}`}>
        <ConversationPane
          detail={detail}
          state={detailState}
          me={user}
          now={now}
          busy={busy}
          banner={banner}
          onDismissBanner={() => setBanner(null)}
          onAction={(k) => void runAction(k)}
          onSend={sendMessage}
          onRetry={() => selectedId && void loadDetail(selectedId, { initial: true })}
          onBack={back}
          onOpenPanel={openPanel}
          onFocusTicket={focusTicket}
          composerFocusKey={composerFocusKey}
          panelPinned={panelPinned}
        />
      </div>

      {/* ≥ 1440: painel fixo (pode ser recolhido). Abaixo: gaveta / folha inferior. */}
      {showPane && panelPinned && <div className="hidden w-ticket-panel shrink-0 border-l border-border-subtle 2xl:flex">{panel}</div>}
      {showPane && panelOpen && (
        <div className={`fixed inset-0 z-40 ${panelPinned ? "2xl:hidden" : ""}`}>
          <div aria-hidden="true" className="absolute inset-0 cursor-pointer bg-ink/30" onClick={() => setPanelOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[80vh] overflow-hidden rounded-t-card shadow-popover md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-ticket-panel md:rounded-none">
            <TicketPanel detail={detail} loading={detailState === "loading"} now={now} onClose={() => setPanelOpen(false)} onRetry={() => selectedId && void loadDetail(selectedId, { initial: true })} />
          </div>
        </div>
      )}

      {toast && (
        <div
          role={toast.tone === "danger" ? "alert" : "status"}
          className={`fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-bubble px-4 py-2.5 text-ui shadow-popover ${
            toast.tone === "danger" ? "bg-danger-tint text-danger-ink" : "bg-ink text-white"
          }`}
        >
          {toast.text}
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                const undo = toast.undo;
                setToast(null);
                undo?.();
              }}
              className="rounded-tag font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Desfazer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
