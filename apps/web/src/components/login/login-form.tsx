"use client";

import { LoginResponse } from "@nexo/shared";
import { ArrowRight, Check, CircleAlert, Eye, EyeOff, Info, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { z } from "zod";
import { ApiError, apiRequest } from "@/lib/api";

type FieldErrors = { email?: string; password?: string };
type Banner = { tone: "danger" | "warning" | "info"; text: string } | null;

const EMAIL = z.email();

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) errors.email = "Informe seu e-mail corporativo.";
  else if (!EMAIL.safeParse(email.trim()).success) errors.email = "Esse e-mail não parece válido. Exemplo: nome.sobrenome@nexo.com.br";
  if (!password) errors.password = "Informe sua senha.";
  return errors;
}

// ?motivo=sessao (vindo de um 401): lido no cliente para o login continuar no static shell.
const noop = () => () => {};
function useSessionExpired(): boolean {
  return useSyncExternalStore(
    noop,
    () => new URLSearchParams(window.location.search).get("motivo") === "sessao",
    () => false,
  );
}

const BANNER_STYLE = {
  danger: "bg-danger-tint text-danger-ink",
  warning: "bg-warning-tint text-warning-ink",
  info: "bg-primary-tint text-primary-ink",
};

function InputBox({ invalid, children }: { invalid: boolean; children: ReactNode }) {
  return (
    <div
      className={`group flex h-11 items-center gap-2.5 rounded-control bg-surface pr-2 pl-3.5 outline-1 -outline-offset-1 ${
        invalid
          ? "outline-[1.5px] outline-danger"
          : "shadow-input outline-border-control focus-within:shadow-none focus-within:outline-[1.5px] focus-within:outline-primary"
      }`}
    >
      {children}
    </div>
  );
}

function FieldError({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return (
    <p id={id} className="mt-0.5 flex items-start gap-1.5 text-meta text-danger-ink">
      <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      {text}
    </p>
  );
}

export function LoginForm() {
  const router = useRouter();
  const headingId = useId();
  const emailErrId = useId();
  const passErrId = useId();
  const popoverId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const forgotRef = useRef<HTMLDivElement>(null);
  const expired = useSessionExpired();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<Banner>(null);
  const [sending, setSending] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const shownBanner: Banner = banner ?? (expired ? { tone: "info", text: "Sua sessão terminou. Entre de novo para continuar." } : null);

  useEffect(() => {
    if (!forgotOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setForgotOpen(false);
    const onClick = (e: MouseEvent) => {
      if (forgotRef.current && !forgotRef.current.contains(e.target as Node)) setForgotOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [forgotOpen]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSubmitted(true);
    const found = validate(email, password);
    setErrors(found);
    if (found.email || found.password) {
      (found.email ? emailRef.current : document.getElementById("password"))?.focus();
      return;
    }
    setSending(true);
    setBanner(null);
    try {
      const res = await apiRequest("/api/auth/login", LoginResponse, {
        method: "POST",
        body: { email: email.trim(), password },
        redirectOn401: false,
      });
      router.replace(res.redirectTo);
    } catch (error) {
      setSending(false);
      if (error instanceof ApiError && (error.code === "invalid_credentials" || error.status === 401)) {
        setBanner({ tone: "danger", text: "Não encontramos esse e-mail. Confira se é o seu e-mail corporativo da Nexo." });
        emailRef.current?.focus();
      } else {
        setBanner({ tone: "warning", text: "Não conseguimos entrar agora. Tente de novo em alguns segundos." });
      }
    }
  };

  const revalidate = () => {
    if (submitted) setErrors(validate(email, password));
  };

  return (
    <form noValidate aria-labelledby={headingId} onSubmit={onSubmit} className="flex w-full flex-col gap-7 sm:max-w-auth-form">
      <div className="flex flex-col gap-2">
        <h1 id={headingId} className="font-serif text-[34px]/9.5 font-normal tracking-[-0.8px] text-ink sm:text-title">
          Entrar
        </h1>
        <p className="text-body-lg text-muted">Use seu e-mail corporativo e a senha da rede Nexo.</p>
      </div>

      <div className="flex flex-col gap-4.5">
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-ui leading-normal font-medium text-ink">
            E-mail corporativo
          </label>
          <InputBox invalid={!!errors.email}>
            <Mail aria-hidden="true" className={`size-4 shrink-0 ${errors.email ? "text-danger-ink" : "text-muted group-focus-within:text-primary-ink"}`} />
            <input
              ref={emailRef}
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoFocus
              readOnly={sending}
              placeholder="nome.sobrenome@nexo.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={revalidate}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? emailErrId : undefined}
              className="h-full min-w-0 flex-1 bg-transparent text-body text-ink placeholder:text-muted focus:outline-none"
            />
          </InputBox>
          <FieldError id={emailErrId} text={errors.email} />
        </div>

        <div className="flex flex-col gap-2">
          <div className="relative flex items-center justify-between" ref={forgotRef}>
            <label htmlFor="password" className="text-ui leading-normal font-medium text-ink">
              Senha
            </label>
            <button
              type="button"
              aria-expanded={forgotOpen}
              aria-controls={popoverId}
              onClick={() => setForgotOpen((v) => !v)}
              className="rounded-tag text-ui leading-normal font-medium text-primary-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Esqueci minha senha
            </button>
            {forgotOpen && (
              <div id={popoverId} role="dialog" aria-label="Esqueci minha senha" className="absolute top-full right-0 z-10 mt-2 w-72 rounded-bubble bg-surface p-3.5 text-ui text-ink shadow-popover">
                Para trocar a senha da rede, ligue no ramal 4000 ou fale com o service desk.
              </div>
            )}
          </div>
          <InputBox invalid={!!errors.password}>
            <LockKeyhole aria-hidden="true" className={`size-4 shrink-0 ${errors.password ? "text-danger-ink" : "text-muted group-focus-within:text-primary-ink"}`} />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              readOnly={sending}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={revalidate}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? passErrId : undefined}
              className={`h-full min-w-0 flex-1 bg-transparent text-body text-ink placeholder:text-muted focus:outline-none ${
                showPassword || !password ? "" : "tracking-[2px]"
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={showPassword}
              className="flex size-7.5 shrink-0 items-center justify-center rounded-tag text-muted hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
            </button>
          </InputBox>
          <FieldError id={passErrId} text={errors.password} />
        </div>

        <label className="flex cursor-pointer items-center gap-2.25 pt-0.5">
          <span className="relative flex size-4.5 shrink-0">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="peer size-4.5 cursor-pointer appearance-none rounded-tag bg-surface outline-1 -outline-offset-1 outline-border-control checked:bg-primary checked:outline-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
            <Check aria-hidden="true" strokeWidth={3} className="pointer-events-none absolute inset-0 m-auto hidden size-3 text-white peer-checked:block" />
          </span>
          <span className="text-ui leading-normal text-ink-secondary">Manter conectado neste computador</span>
        </label>
      </div>

      {shownBanner && (
        <div role="alert" className={`-mt-2 flex gap-2.5 rounded-control p-3 text-ui ${BANNER_STYLE[shownBanner.tone]}`}>
          {shownBanner.tone === "info" ? (
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          )}
          <p>{shownBanner.text}</p>
        </div>
      )}

      <button
          type="submit"
          aria-busy={sending}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-control bg-primary text-body-lg font-semibold text-white shadow-primary hover:bg-primary-hover active:bg-primary-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {sending ? "Entrando…" : "Entrar"}
          {sending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <ArrowRight aria-hidden="true" className="size-4" />}
      </button>
      <p className="-mt-3 text-center text-ui text-muted sm:hidden">
          Problema para entrar?{" "}
          <a href="tel:4000" className="font-semibold text-primary-ink">
            Ligue no ramal 4000
          </a>
        </p>
      <p className="border-t border-border-subtle pt-4 text-meta text-muted">
        Ambiente de demonstração: entre com um e-mail dos dados de exemplo e qualquer senha.
      </p>
    </form>
  );
}
