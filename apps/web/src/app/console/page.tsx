import { ConsoleFilter } from "@nexo/shared";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ConsoleApp } from "@/components/console/console-app";
import { AppShellSkeleton } from "@/components/ui/app-shell-skeleton";
import { toViewer } from "@/lib/viewer";
import { getSessionUser } from "@/server";

export const metadata: Metadata = { title: "Console · Nexo Assist" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Telas 4–5. Filtro, busca e conversa aberta vêm dos searchParams (?filter, ?q, ?c);
 * a leitura da sessão e dos parâmetros fica atrás do Suspense (Cache Components).
 */
export default function ConsolePage({ searchParams }: PageProps<"/console">) {
  return (
    <Suspense fallback={<AppShellSkeleton variant="console" />}>
      <ConsoleGate searchParams={searchParams} />
    </Suspense>
  );
}

async function ConsoleGate({ searchParams }: { searchParams: PageProps<"/console">["searchParams"] }) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams]);
  if (!user) redirect("/?motivo=sessao");
  if (user.role !== "analista") redirect("/chat");
  const filter = ConsoleFilter.safeParse(one(params.filter));
  return (
    <ConsoleApp
      user={toViewer(user)}
      initialFilter={filter.success ? filter.data : "para_voce"}
      initialQuery={one(params.q)?.slice(0, 100) ?? ""}
      initialId={one(params.c) ?? null}
    />
  );
}
