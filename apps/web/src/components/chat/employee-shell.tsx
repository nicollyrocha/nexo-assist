"use client";

import { ChevronRight, Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Viewer } from "@/lib/viewer";
import { BrandMark } from "@/components/ui/brand-mark";
import { ChatDrawer, ChatSidebar, type NavKey } from "./chat-sidebar";

/** Casca das telas do funcionário: sidebar, gaveta no celular e barra superior com o caminho atual. */
export function EmployeeShell({
  user,
  active,
  crumb,
  headerEnd,
  children,
}: {
  user: Viewer;
  active: NavKey;
  crumb: string;
  headerEnd?: ReactNode;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <div className="flex h-dvh overflow-clip bg-surface">
      <ChatSidebar user={user} active={active} />
      <ChatDrawer user={user} active={active} open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle px-4 md:h-topbar md:gap-4 md:px-8">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu"
            className="-ml-2 flex size-10 items-center justify-center rounded-control text-ink-secondary hover:bg-surface-subtle cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:hidden"
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
                {crumb}
              </li>
            </ol>
          </nav>
          {headerEnd}
        </header>
        {children}
      </div>
    </div>
  );
}
