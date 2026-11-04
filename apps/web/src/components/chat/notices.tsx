"use client";

import type { ConversationStatus } from "@nexo/shared";
import { CircleCheck, CloudOff, Hand, Headset, Info, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/ui/brand-mark";
import { logout } from "@/lib/api";
import { btnPrimary, btnSecondary } from "./draft-card";

/** Pílula "quem está atendendo agora" (topbar). */
export function StatusPill({ status, analystName }: { status: ConversationStatus; analystName: string | null }) {
  const map = {
    ativa: { cls: "bg-success-tint text-success-ink", long: "Assistente online", short: "Online", icon: null },
    aguardando_atendente: { cls: "bg-warning-tint text-warning-ink", long: "Aguardando um analista", short: "Aguardando", icon: Hand },
    em_atendimento: {
      cls: "bg-success-tint text-success-ink",
      long: `${analystName ?? "Um analista"} está atendendo`,
      short: "Com analista",
      icon: Headset,
    },
    encerrada: { cls: "bg-surface-subtle text-ink-secondary", long: "Conversa encerrada", short: "Encerrada", icon: CircleCheck },
  }[status];
  const Icon = map.icon;
  return (
    <span role="status" className={`inline-flex shrink-0 items-center gap-1.75 rounded-full px-2.5 py-1.25 text-meta font-semibold ${map.cls}`}>
      {Icon ? <Icon aria-hidden="true" className="size-3.5" /> : <span aria-hidden="true" className="size-1.75 rounded-full bg-success" />}
      <span className="hidden sm:inline">{map.long}</span>
      <span className="sm:hidden">{map.short}</span>
    </span>
  );
}

/** Aviso fixo acima do composer quando a conversa está com analista (agent pausado). */
export function AgentPausedNotice({ status, analystName }: { status: "aguardando_atendente" | "em_atendimento"; analystName: string | null }) {
  const waiting = status === "aguardando_atendente";
  const Icon = waiting ? Hand : Headset;
  return (
    <div id="paused-notice" className="mb-2 flex items-center gap-3 rounded-bubble bg-surface-subtle p-3">
      <span
        aria-hidden="true"
        className={`flex size-8 shrink-0 items-center justify-center rounded-full sm:size-9 ${
          waiting ? "bg-warning-tint text-warning-ink" : "bg-success-tint text-success-ink"
        }`}
      >
        <Icon className="size-4.25" />
      </span>
      <div className="min-w-0">
        <p className="text-body font-semibold text-ink">
          {waiting ? "Chamei um analista para você" : `${analystName ?? "Um analista"} está atendendo você`}
        </p>
        <p className="text-meta text-muted">
          {waiting ? (
            <>
              <span className="hidden sm:inline">
                Ele vai ver o resumo do caso e responder por aqui. Enquanto isso, o assistente fica pausado. Pode deixar mais detalhes, se quiser.
              </span>
              <span className="sm:hidden">Ele responde por aqui. O assistente está pausado.</span>
            </>
          ) : (
            "Suas mensagens vão direto para o analista. O assistente está pausado."
          )}
        </p>
      </div>
    </div>
  );
}

/** Limite de 30 mensagens por sessão de login: input bloqueado, sair e entrar de novo. */
export function SessionLimitNotice({ limit }: { limit: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      className="flex flex-col gap-3 rounded-bubble bg-surface-subtle p-4 outline-1 -outline-offset-1 outline-border-subtle focus-visible:outline-2 focus-visible:outline-primary sm:flex-row sm:items-center"
    >
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-ink">Esta sessão chegou ao limite de {limit} mensagens</p>
        <p className="text-ui text-muted">
          Seus chamados e rascunhos continuam salvos. Saia e entre de novo para continuar: eu sigo de onde paramos.
        </p>
      </div>
      <button
        type="button"
        className={`${btnPrimary} pr-3.5`}
        disabled={leaving}
        onClick={() => {
          setLeaving(true);
          void logout();
        }}
      >
        {leaving && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
        Sair e entrar de novo
      </button>
    </div>
  );
}

export function ClosedNotice({ byName, time, onNew, busy }: { byName: string | null; time: string; onNew: () => void; busy: boolean }) {
  return (
    <div role="status" className="flex flex-col gap-3 rounded-bubble bg-surface-subtle p-4 outline-1 -outline-offset-1 outline-border-subtle sm:flex-row sm:items-center">
      <p className="min-w-0 flex-1 text-ui text-ink">
        Esta conversa foi encerrada{byName ? ` por ${byName}` : ""} às {time}.
      </p>
      <button type="button" className={`${btnPrimary} pr-3.5`} onClick={onNew} disabled={busy}>
        {busy && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
        Começar nova conversa
      </button>
    </div>
  );
}

/** Contador da sessão: visível a partir de 25 mensagens (decisão do briefing). */
export function SessionCounter({ used, limit, id }: { used: number; limit: number; id: string }) {
  if (used < limit - 5) return <p id={id} className="text-meta whitespace-nowrap text-muted tabular-nums">{`${used}/${limit} mensagens nesta sessão`}</p>;
  const reached = used >= limit;
  return (
    <p id={id} aria-live="polite" className="inline-flex items-center gap-1 text-meta text-warning-ink tabular-nums">
      {!reached && <Info aria-hidden="true" className="size-3" />}
      {reached ? `${limit}/${limit} · limite da sessão atingido` : `${used}/${limit} mensagens nesta sessão · restam ${limit - used}`}
    </p>
  );
}

export function EmptyState({ firstName, onPick, disabled }: { firstName: string; onPick: (text: string) => void; disabled: boolean }) {
  const suggestions = ["Minha VPN não conecta", "Como está meu chamado?", "Preciso de acesso a um sistema", "Quero falar com um analista"];
  return (
    <div className="mx-auto flex max-w-[560px] flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <BrandMark className="h-7 w-8 fill-brand-mark" />
      <h2 className="font-serif text-empty text-ink">Como posso ajudar, {firstName}?</h2>
      <p className="text-body text-muted">
        Conte com suas palavras o que está acontecendo. Eu consulto seus chamados, busco na central de ajuda e chamo um analista quando precisar.
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className="min-h-9 rounded-control bg-surface px-3 py-1.75 text-ui font-medium text-ink outline-1 -outline-offset-1 outline-border-subtle enabled:hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-55"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
      <CloudOff aria-hidden="true" className="size-6 text-muted" />
      <p className="text-body font-medium text-ink">Não consegui carregar sua conversa.</p>
      <p className="text-ui text-muted">Verifique sua conexão e tente de novo.</p>
      <button type="button" className={`${btnSecondary} mt-2`} onClick={onRetry}>
        Tentar de novo
      </button>
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando a conversa" className="flex flex-1 flex-col justify-end gap-5 pb-1">
      <div className="h-11 w-70 max-w-[70%] self-end animate-pulse rounded-bubble bg-surface-subtle" />
      <div className="h-22 w-130 max-w-full animate-pulse rounded-bubble bg-surface-subtle" />
      <div className="h-11 w-50 max-w-[60%] self-end animate-pulse rounded-bubble bg-surface-subtle" />
    </div>
  );
}
