"use client";

import { LogOut, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/ui/brand-mark";
import { logout } from "@/lib/api";
import { initials } from "@/lib/format";
import type { Viewer } from "@/lib/viewer";

const focusRing = "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed";

export function badgeText(n: number) {
  return n > 99 ? "99+" : String(n);
}

/** Menu do usuário (nome, nível, Sair). */
export function UserMenu({ user, align = "left" }: { user: Viewer; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${user.name}, menu da conta`}
        onClick={() => setOpen((v) => !v)}
        className={`relative flex size-9 items-center justify-center rounded-full bg-primary-tint text-meta font-bold text-primary-ink ${focusRing}`}
      >
        {initials(user.name)}
        <span aria-hidden="true" className="absolute top-6.5 left-6.5 size-2.5 rounded-full bg-success outline-2 outline-surface-subtle" />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute z-30 w-56 rounded-bubble bg-surface p-1.5 shadow-popover ${align === "left" ? "bottom-0 left-full ml-2" : "top-full right-0 mt-2"}`}
        >
          <div className="px-2.5 py-2">
            <p className="text-ui font-semibold text-ink">{user.name}</p>
            <p className="text-micro text-muted">Suporte {user.detail}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => void logout()}
            className={`flex h-8.5 w-full items-center gap-2.5 rounded-control px-2.5 text-ui font-medium text-ink-secondary hover:bg-surface-subtle ${focusRing}`}
          >
            <LogOut aria-hidden="true" className="size-4 text-muted" />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}

/** Rail do console (64px): logo, Conversas com contador "Para você", usuário. */
export function Rail({ user, waiting }: { user: Viewer; waiting: number }) {
  return (
    <nav aria-label="Navegação do console" className="hidden w-rail shrink-0 flex-col items-center gap-1.5 border-r border-border-subtle bg-surface-subtle py-4 md:flex">
      <div className="flex size-10 items-center justify-center pb-2">
        <BrandMark className="h-4.75 w-5.5 fill-brand-mark" />
      </div>
      <a
        href="/console"
        aria-current="page"
        aria-label={waiting > 0 ? `Conversas, ${waiting} precisam de você` : "Conversas"}
        className={`relative flex size-10 items-center justify-center rounded-bubble bg-surface drop-shadow-rail ${focusRing}`}
      >
        <MessageCircle aria-hidden="true" className="size-4.75 text-ink" />
        {waiting > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 left-6 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1.25 text-badge font-bold text-white outline-2 outline-surface-subtle"
          >
            {badgeText(waiting)}
          </span>
        )}
      </a>
      <div className="flex-1" />
      <UserMenu user={user} />
    </nav>
  );
}
