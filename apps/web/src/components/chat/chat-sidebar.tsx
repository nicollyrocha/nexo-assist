"use client";

import { LogOut, MessageSquare, UserRound, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Viewer } from "@/lib/viewer";
import { BrandMark } from "@/components/ui/brand-mark";
import { logout } from "@/lib/api";
import { initials } from "@/lib/format";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function NavItems({ compact }: { compact: boolean }) {
  return (
    <ul className="flex flex-col gap-0.5">
      <li>
        <a
          href="/chat"
          aria-current="page"
          title={compact ? "Atendimento" : undefined}
          className={`flex h-9 items-center gap-2.5 rounded-control bg-primary-tint text-ui font-semibold text-primary-ink ${compact ? "justify-center" : "px-2.5"} ${focusRing}`}
        >
          <MessageSquare aria-hidden="true" className="size-4 shrink-0" />
          <span className={compact ? "sr-only" : ""}>Atendimento</span>
        </a>
      </li>
      <li>
        {/* Tela "Meu perfil" fica fora do escopo (extra do protótipo): item visível, sem destino. */}
        <span
          aria-disabled="true"
          title="Em breve"
          className={`flex h-9 cursor-default items-center gap-2.5 rounded-control text-ui font-medium text-ink-secondary ${compact ? "justify-center" : "px-2.5"}`}
        >
          <UserRound aria-hidden="true" className="size-4 shrink-0 text-muted" />
          <span className={compact ? "sr-only" : ""}>Meu perfil</span>
        </span>
      </li>
    </ul>
  );
}

function UserBlock({ user, compact }: { user: Viewer; compact: boolean }) {
  return (
    <div className="flex flex-col gap-1 border-t border-border-subtle pt-3.5 pb-1">
      <div className={`flex items-center gap-2.5 ${compact ? "justify-center" : "px-2"}`} title={compact ? `${user.name} · ${user.email}` : undefined}>
        <span
          aria-hidden={compact ? undefined : "true"}
          aria-label={compact ? user.name : undefined}
          role={compact ? "img" : undefined}
          className="flex size-8.5 shrink-0 items-center justify-center rounded-full bg-primary-tint text-meta font-bold text-primary-ink"
        >
          {initials(user.name)}
        </span>
        {!compact && (
          <span className="min-w-0">
            <span className="block truncate text-ui font-semibold text-ink">{user.name}</span>
            <span className="block truncate text-micro text-muted">{user.email}</span>
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => void logout()}
        title={compact ? "Sair" : undefined}
        className={`mt-2 flex h-8.5 items-center gap-2.5 rounded-control text-ui font-medium text-ink-secondary hover:bg-surface-subtle ${compact ? "justify-center" : "px-2.5"} ${focusRing}`}
      >
        <LogOut aria-hidden="true" className="size-4 shrink-0 text-muted" />
        <span className={compact ? "sr-only" : ""}>Sair</span>
      </button>
    </div>
  );
}

/** Sidebar do chat: 232px a partir de 1024, só ícones entre 768 e 1023, gaveta abaixo de 768. */
export function ChatSidebar({ user }: { user: Viewer }) {
  return (
    <nav aria-label="Navegação principal" className="hidden shrink-0 flex-col border-r border-border-subtle pt-5 pb-3.5 md:flex md:w-16 md:px-2 lg:w-sidebar lg:px-3.5">
      <div className="flex items-center gap-2.5 md:justify-center lg:justify-start lg:px-2">
        <BrandMark className="h-4.5 w-5 fill-brand-mark" />
        <span className="hidden text-brand font-bold text-ink lg:inline">Nexo Assist</span>
      </div>
      <div className="h-5.5" />
      <div className="lg:hidden">
        <NavItems compact />
      </div>
      <div className="hidden lg:block">
        <NavItems compact={false} />
      </div>
      <div className="flex-1" />
      <div className="lg:hidden">
        <UserBlock user={user} compact />
      </div>
      <div className="hidden lg:block">
        <UserBlock user={user} compact={false} />
      </div>
    </nav>
  );
}

/** Gaveta do celular: mesmo conteúdo da sidebar, modal, foco preso, Esc fecha. */
export function ChatDrawer({ user, open, onClose }: { user: Viewer; open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panelRef.current) {
        const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>("button, a[href]"));
        if (items.length === 0) return;
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
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div aria-hidden="true" className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="absolute inset-y-0 left-0 flex w-70 flex-col bg-surface px-3.5 pt-5 pb-3.5 shadow-popover"
      >
        <div className="flex items-center gap-2.5 px-2">
          <BrandMark className="h-4.5 w-5 fill-brand-mark" />
          <span className="flex-1 text-brand font-bold text-ink">Nexo Assist</span>
          <button type="button" onClick={onClose} aria-label="Fechar menu" className={`flex size-9 items-center justify-center rounded-control text-muted hover:bg-surface-subtle ${focusRing}`}>
            <X aria-hidden="true" className="size-4.5" />
          </button>
        </div>
        <div className="h-5.5" />
        <NavItems compact={false} />
        <div className="flex-1" />
        <UserBlock user={user} compact={false} />
      </div>
    </div>
  );
}
