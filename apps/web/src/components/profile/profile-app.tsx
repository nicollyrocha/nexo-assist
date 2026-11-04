"use client";

import { KeyRound, Lock, Mail, RotateCcwKey } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Viewer } from "@/lib/viewer";
import { EmployeeShell } from "@/components/chat/employee-shell";

const card = "overflow-hidden rounded-card bg-surface shadow-card outline-1 -outline-offset-1 outline-border-card";
const focusRing = "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** Mesma orientação do "Esqueci minha senha" do login: não há troca de senha nem envio de e-mail no produto. */
const RESET_HELP = "Para trocar a senha da rede, ligue no ramal 4000 ou fale com o service desk.";

function Row({ label, children, last, tall }: { label: string; children: ReactNode; last?: boolean; tall?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 px-6 py-5 sm:flex-row sm:items-center sm:gap-4 ${tall ? "sm:h-24.5" : ""} ${last ? "" : "border-b border-border-subtle"}`}>
      <dt className="text-ui text-muted sm:w-40 sm:shrink-0">{label}</dt>
      <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">{children}</dd>
    </div>
  );
}

/** Extra do protótipo: "Meu perfil". Só mostra o que a sessão tem (nome, e-mail); a senha é gerenciada pela TI. */
export function ProfileApp({ user }: { user: Viewer }) {
  const popoverId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (!helpOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setHelpOpen(false);
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setHelpOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [helpOpen]);

  return (
    <EmployeeShell user={user} active="perfil" crumb="Meu perfil">
      <main className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-8 md:px-10 md:py-12">
        <div className="relative mx-auto flex w-full max-w-150 flex-col gap-8 2xl:left-11.5">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl leading-[normal] font-bold tracking-[-0.4px] text-ink">Meu perfil</h1>
            <p className="text-body leading-[normal] text-muted">Seus dados de acesso ao service desk de TI.</p>
          </div>

          <dl className={card}>
            <Row label="Nome" tall>
              <span className="text-body leading-[normal] font-medium text-ink">{user.name}</span>
            </Row>
            <Row label="E-mail corporativo" last>
              <span className="min-w-0 basis-full text-body leading-[normal] font-medium break-words text-ink sm:basis-0 sm:flex-1">{user.email}</span>
              <span className="flex shrink-0 items-center gap-1.25 text-meta text-muted">
                <Lock aria-hidden="true" className="size-3.25" />
                Gerenciado pela TI
              </span>
            </Row>
          </dl>

          <section aria-labelledby="senha-title" className={card}>
            <div className="flex flex-wrap items-center gap-4 p-6">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-subtle">
                <KeyRound aria-hidden="true" className="size-4.5 text-ink-secondary" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.75">
                <h2 id="senha-title" className="text-body leading-[normal] font-semibold text-ink">
                  Senha
                </h2>
                <p className="text-ui leading-[normal] text-muted">Gerenciada pela TI</p>
              </div>
              <div ref={wrapRef} className="relative">
                <button
                  type="button"
                  aria-expanded={helpOpen}
                  aria-controls={popoverId}
                  onClick={() => setHelpOpen((v) => !v)}
                  className={`flex h-9 items-center gap-1.75 rounded-control bg-surface pr-3.5 pl-3 text-ui font-medium text-ink-secondary shadow-button outline-1 -outline-offset-1 outline-border-control hover:bg-surface-subtle ${focusRing}`}
                >
                  <RotateCcwKey aria-hidden="true" className="size-3.75" />
                  Redefinir senha
                </button>
                {helpOpen && (
                  <div id={popoverId} role="dialog" aria-label="Redefinir senha" className="absolute top-full right-0 z-10 mt-2 w-72 rounded-bubble bg-surface p-3.5 text-ui text-ink shadow-popover">
                    {RESET_HELP}
                  </div>
                )}
              </div>
            </div>
            <div className="flex min-h-16 items-center gap-2 border-t border-border-subtle bg-surface-subtle px-6 py-3">
              <Mail aria-hidden="true" className="size-3.5 shrink-0 text-muted" />
              <p className="text-[13px] leading-[normal] text-muted">A senha da rede é redefinida pelo service desk, no ramal 4000.</p>
            </div>
          </section>
        </div>
      </main>
    </EmployeeShell>
  );
}
