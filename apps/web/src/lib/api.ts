import { ApiErrorBody } from "@nexo/shared";
import type { z } from "zod";

// Cliente HTTP do navegador para as rotas do app (contrato em @nexo/shared/web-api).
// 401 em qualquer rota protegida leva de volta ao login com o aviso de sessão expirada.

export type ApiErrorCode = ApiErrorBody["error"]["code"];

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode | "network",
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const SESSION_EXPIRED_URL = "/?motivo=sessao";

export function goToLogin() {
  // Navegação completa de propósito: descarta todo o estado do cliente da sessão que expirou.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(SESSION_EXPIRED_URL);
}

async function errorFrom(res: Response): Promise<ApiError> {
  const raw: unknown = await res.json().catch(() => null);
  const parsed = ApiErrorBody.safeParse(raw);
  if (parsed.success) return new ApiError(parsed.data.error.code, parsed.data.error.message, res.status);
  return new ApiError(res.status >= 500 ? "internal" : "invalid_input", `Erro ${res.status}`, res.status);
}

type Options = { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal; redirectOn401?: boolean };

/** Faz a chamada, valida a resposta com o schema do contrato e lança ApiError nos erros. */
export async function apiRequest<S extends z.ZodType>(url: string, schema: S, opts: Options = {}): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.body === undefined ? undefined : { "content-type": "application/json" },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
      cache: "no-store",
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError("network", "Sem conexão com o servidor.", 0);
  }
  if (res.status === 401 && opts.redirectOn401 !== false) {
    goToLogin();
    throw new ApiError("unauthorized", "Sessão expirada.", 401);
  }
  if (!res.ok) throw await errorFrom(res);
  const json: unknown = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiError("internal", "Resposta fora do contrato.", res.status);
  return parsed.data;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  // Idem: sair zera o estado do cliente (conversa, polling) antes de voltar ao login.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/");
}
