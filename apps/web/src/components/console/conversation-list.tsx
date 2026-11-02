"use client";

import { CONSOLE_FILTERS, type ConsoleFilter, type ConsoleList, type ConversationSummary } from "@nexo/shared";
import { Inbox, Search, TriangleAlert, X } from "lucide-react";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { EMPTY_LIST_COPY, FILTER_LABELS, previewPrefix, summaryTag } from "@/lib/console-copy";
import { avatarColor, formatListTime, initials } from "@/lib/format";
import { btnSecondary } from "@/components/chat/draft-card";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

type Props = {
  data: ConsoleList | null;
  error: boolean;
  filter: ConsoleFilter;
  query: string;
  selectedId: string | null;
  highlighted: Set<string>;
  myId: string;
  now: Date;
  header?: ReactNode;
  onFilter: (f: ConsoleFilter) => void;
  onQuery: (q: string) => void;
  onSelect: (id: string) => void;
  onRetry: () => void;
};

export function Avatar({ id, name, size }: { id: string; name: string; size: 32 | 40 | 46 }) {
  const cls = size === 46 ? "size-11.5 text-body-lg" : size === 40 ? "size-10 text-body" : "size-8 text-meta";
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${cls} ${avatarColor(id)}`}>
      {initials(name)}
    </span>
  );
}

function Item({
  c,
  selected,
  hideBorder,
  highlighted,
  myId,
  now,
  onSelect,
  onKeyDown,
}: {
  c: ConversationSummary;
  selected: boolean;
  hideBorder: boolean;
  highlighted: boolean;
  myId: string;
  now: Date;
  onSelect: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const waiting = c.status === "aguardando_atendente";
  const tag = summaryTag(c, myId, now);
  const tagText = [...tag.parts, ...(tag.wait ? [tag.wait] : [])].join(" · ");
  const time = formatListTime(c.lastMessageAt, now);
  const prefix = previewPrefix(c, myId);
  return (
    <li>
      <button
        type="button"
        data-conversation-item
        onClick={onSelect}
        onKeyDown={onKeyDown}
        aria-current={selected ? "true" : undefined}
        aria-label={`${c.employee.name}, ${tagText}, última mensagem às ${time}: ${prefix}${c.lastMessagePreview}`}
        className={`flex w-full items-center gap-3 rounded-bubble p-2.5 text-left transition-colors duration-2000 hover:bg-surface-subtle ${
          selected ? "bg-surface-subtle" : highlighted ? "bg-warning-tint" : ""
        } ${focusRing}`}
      >
        <Avatar id={c.employee.id} name={c.employee.name} size={46} />
        <span className={`flex min-w-0 flex-1 flex-col gap-0.75 pb-2.5 ${hideBorder ? "" : "border-b border-border-subtle"}`}>
          <span className="flex items-baseline gap-2">
            <span className={`flex-1 truncate text-body-lg text-ink ${waiting ? "font-semibold" : "font-medium"}`}>{c.employee.name}</span>
            <span className={`text-meta tabular-nums ${waiting ? "font-semibold text-primary" : "text-muted"}`}>{time}</span>
          </span>
          <span className={`truncate text-ui text-muted ${c.lastMessageRole === "sistema" ? "italic" : ""}`}>
            {prefix}
            {c.lastMessagePreview}
          </span>
          <span title={tagText} className="flex min-w-0 items-center gap-1.25">
            <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${tag.dot}`} />
            <span className={`truncate text-micro font-medium ${tag.tone}`}>
              {tag.parts.join(" · ")}
              {tag.wait && (
                <>
                  {" · "}
                  <span className={tag.longWait ? "font-semibold" : ""}>{tag.wait}</span>
                </>
              )}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}

/** Lista de conversas (Tela 4): título, busca, filtros em pílulas e itens. */
export function ConversationList({ data, error, filter, query, selectedId, highlighted, myId, now, header, onFilter, onQuery, onSelect, onRetry }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const conversations = data?.conversations ?? [];

  const moveFocus = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-conversation-item]") ?? []);
    const i = items.indexOf(e.currentTarget);
    items[Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = CONSOLE_FILTERS[(i + (e.key === "ArrowRight" ? 1 : -1) + CONSOLE_FILTERS.length) % CONSOLE_FILTERS.length];
    onFilter(next);
    requestAnimationFrame(() => document.getElementById(`filter-${next}`)?.focus());
  };

  const selectedIndex = conversations.findIndex((c) => c.id === selectedId);
  const empty = EMPTY_LIST_COPY[filter];

  return (
    <section aria-label="Lista de conversas" className="flex h-full min-h-0 flex-col">
      {header}
      <div className="flex flex-col gap-3 px-4 pt-4 pb-2.5">
        <div className="hidden items-center gap-2 md:flex">
          <h1 className="flex-1 text-heading font-bold text-ink">Conversas</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-tint px-2.5 py-1.25 text-meta font-semibold text-success-ink">
            <span aria-hidden="true" className="size-1.75 rounded-full bg-success" />
            Disponível
          </span>
        </div>
        <div className="flex h-9 items-center gap-2.5 rounded-full bg-surface-subtle px-3 focus-within:outline-[1.5px] focus-within:outline-primary">
          <Search aria-hidden="true" className="size-3.75 shrink-0 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Pesquisar conversa ou chamado"
            aria-label="Pesquisar conversa ou chamado"
            className="h-full min-w-0 flex-1 bg-transparent text-ui text-ink placeholder:text-muted focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" onClick={() => onQuery("")} aria-label="Limpar busca" className={`rounded-full text-muted hover:text-ink ${focusRing}`}>
              <X aria-hidden="true" className="size-3.5" />
            </button>
          )}
        </div>
        <div role="tablist" aria-label="Filtrar conversas" className="scrollbar-thin -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
          {CONSOLE_FILTERS.map((f, i) => {
            const active = f === filter;
            const count = data?.counts[f];
            return (
              <button
                key={f}
                id={`filter-${f}`}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => onFilter(f)}
                onKeyDown={(e) => onTabKey(e, i)}
                aria-label={f === "todas" || count === undefined ? FILTER_LABELS[f] : `${FILTER_LABELS[f]}, ${count}`}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.25 py-1.5 text-meta whitespace-nowrap ${active ? "bg-primary-tint" : "bg-surface-subtle hover:bg-border-subtle"} ${focusRing}`}
              >
                <span className={`font-medium ${active ? "text-primary-ink" : "text-ink-secondary"}`}>{FILTER_LABELS[f]}</span>
                {f !== "todas" && count !== undefined && (
                  <span className={`font-semibold tabular-nums ${active ? "text-primary-ink" : "text-muted"}`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {error && data && (
        <p role="status" className="mx-4 mb-2 rounded-control bg-warning-tint px-3 py-1.5 text-meta text-warning-ink">
          Lista desatualizada — tentando de novo…
        </p>
      )}

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {!data && !error && (
          <ul aria-busy="true" aria-label="Carregando conversas">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="flex animate-pulse items-center gap-3 p-2.5">
                <span className="size-11.5 rounded-full bg-surface-subtle" />
                <span className="flex flex-1 flex-col gap-2">
                  <span className="h-3.5 w-1/2 rounded-full bg-surface-subtle" />
                  <span className="h-3 w-4/5 rounded-full bg-surface-subtle" />
                </span>
              </li>
            ))}
          </ul>
        )}
        {!data && error && (
          <div role="alert" className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <TriangleAlert aria-hidden="true" className="size-5 text-warning-ink" />
            <p className="text-ui text-ink">Não consegui atualizar a lista.</p>
            <button type="button" className={btnSecondary} onClick={onRetry}>
              Tentar de novo
            </button>
          </div>
        )}
        {data && conversations.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Inbox aria-hidden="true" className="size-6 text-muted" />
            {query ? (
              <>
                <p className="text-ui font-medium text-ink">Nada encontrado para “{query}”.</p>
                <button type="button" className={btnSecondary} onClick={() => onQuery("")}>
                  Limpar busca
                </button>
              </>
            ) : (
              <>
                <p className="text-ui font-medium text-ink">{empty.title}</p>
                {empty.body && <p className="text-meta text-muted">{empty.body}</p>}
              </>
            )}
          </div>
        )}
        {data && conversations.length > 0 && (
          <ul ref={listRef}>
            {conversations.map((c, i) => (
              <Item
                key={c.id}
                c={c}
                selected={c.id === selectedId}
                hideBorder={i === selectedIndex || i === selectedIndex - 1 || i === conversations.length - 1}
                highlighted={highlighted.has(c.id)}
                myId={myId}
                now={now}
                onSelect={() => onSelect(c.id)}
                onKeyDown={moveFocus}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
