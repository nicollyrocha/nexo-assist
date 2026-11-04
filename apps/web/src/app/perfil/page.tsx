import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ProfileApp } from "@/components/profile/profile-app";
import { AppShellSkeleton } from "@/components/ui/app-shell-skeleton";
import { toViewer } from "@/lib/viewer";
import { getSessionUser } from "@/server";

export const metadata: Metadata = { title: "Meu perfil · Nexo Assist" };

/** Extra do protótipo. A leitura da sessão fica atrás do Suspense (Cache Components); o shell é estático. */
export default function ProfilePage() {
  return (
    <Suspense fallback={<AppShellSkeleton variant="chat" />}>
      <ProfileGate />
    </Suspense>
  );
}

async function ProfileGate() {
  const user = await getSessionUser();
  if (!user) redirect("/?motivo=sessao");
  if (user.role !== "funcionario") redirect("/console");
  return <ProfileApp user={toViewer(user)} />;
}
