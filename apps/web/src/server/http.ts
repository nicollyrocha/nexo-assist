import type { ApiErrorBody } from "@nexo/shared";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

export type ApiErrorCode = ApiErrorBody["error"]["code"];

const STATUS: Record<ApiErrorCode, number> = {
  invalid_credentials: 401,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  limit_reached: 429,
  conflict: 409,
  agent_paused: 409,
  unavailable: 503,
  internal: 500,
};

/** Erro de API no formato do contrato (ApiErrorBody). */
export class ApiFailure extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiFailure";
  }
  get status() {
    return STATUS[this.code];
  }
}

export const apiError = (code: ApiErrorCode, message: string, headers?: HeadersInit) =>
  Response.json({ error: { code, message } } satisfies ApiErrorBody, { status: STATUS[code], headers });

export const json = (body: unknown, init?: ResponseInit) =>
  Response.json(body, { ...init, headers: { "cache-control": "no-store", ...init?.headers } });

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const raw: unknown = await req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ApiFailure("invalid_input", z.prettifyError(parsed.error));
  return parsed.data;
}

/** Log estruturado sem segredos: só nome e primeira linha da mensagem do erro. */
export function logError(scope: string, error: unknown, extra: Record<string, unknown> = {}) {
  const detail =
    error instanceof Error ? { name: error.name, message: error.message.split("\n")[0] } : { message: String(error) };
  console.error(JSON.stringify({ level: "error", scope, ...detail, ...extra }));
}

/** Envolve um handler: ApiFailure vira resposta do contrato; o resto vira 500 logado. */
export function handle<A extends unknown[]>(scope: string, fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      // Erros internos do Next (ex.: sair do prerender ao ler a requisição) seguem para o Next.
      unstable_rethrow(error);
      if (error instanceof ApiFailure) return apiError(error.code, error.message);
      logError(scope, error);
      return apiError("internal", "Erro interno. Tente de novo em instantes.");
    }
  };
}
