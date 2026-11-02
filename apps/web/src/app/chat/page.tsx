import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ChatApp } from "@/components/chat/chat-app";
import { AppShellSkeleton } from "@/components/ui/app-shell-skeleton";
import { toViewer } from "@/lib/viewer";
import { getSessionUser } from "@/server";

export const metadata: Metadata = { title: "Atendimento · Nexo Assist" };

/** Telas 2–3. A leitura da sessão fica atrás do Suspense (Cache Components); o shell é estático. */
export default function ChatPage() {
  return (
    <Suspense fallback={<AppShellSkeleton variant="chat" />}>
      <ChatGate />
    </Suspense>
  );
}

async function ChatGate() {
  const user = await getSessionUser();
  if (!user) redirect("/?motivo=sessao");
  if (user.role !== "funcionario") redirect("/console");
  return <ChatApp user={toViewer(user)} />;
}
