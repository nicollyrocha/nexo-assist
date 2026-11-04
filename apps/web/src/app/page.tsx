import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/login/login-form";
import { Showcase } from "@/components/login/showcase";
import { BrandMark } from "@/components/ui/brand-mark";
import { getSessionUser, homeFor } from "@/server";

export const metadata: Metadata = { title: "Entrar · Nexo Assist" };

/** Tela 1 — Login. Tudo estático (static shell); só o "já está logado?" lê a sessão, atrás do Suspense. */
export default function LoginPage() {
  return (
    <div className="flex min-h-dvh bg-surface">
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <Showcase />
      <main className="flex min-w-0 flex-1 flex-col justify-between gap-10 px-6 py-6 sm:px-14 sm:py-10">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2.5 lg:invisible">
            <BrandMark className="h-4.5 w-5 fill-brand-mark" />
            <span className="text-brand font-bold text-ink">Nexo Assist</span>
          </span>
          <p className="hidden gap-1.5 text-ui sm:flex">
            <span className="text-muted">Problema para entrar?</span>
            <a href="tel:4000" className="rounded-tag font-semibold text-primary-ink hover:underline cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              Ligue no ramal 4000
            </a>
          </p>
        </div>

        <div className="flex justify-center">
          <LoginForm />
        </div>

        <footer className="flex flex-col gap-1 text-meta text-muted sm:flex-row sm:justify-between">
          <span>© 2026 Nexo · Service desk de TI</span>
          {/* Página de privacidade fora do escopo; o resumo vem do Anexo A (privacidade). */}
          <a
            href="#privacidade"
            title="Seus chamados só são mostrados a você e aos analistas do service desk."
            className="rounded-tag hover:text-ink cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Privacidade e uso de dados
          </a>
        </footer>
      </main>
    </div>
  );
}

async function RedirectIfSignedIn() {
  const user = await getSessionUser();
  if (user) redirect(homeFor(user.role));
  return null;
}
