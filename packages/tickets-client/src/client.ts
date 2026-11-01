import {
  AddCommentInput,
  ApiError,
  ApiResponses,
  CreateTicketInput,
  IDEMPOTENCY_KEY_HEADER,
  ReopenTicketInput,
  SERVICE_KEY_HEADER,
  TransferTicketInput,
  type ApiErrorCode,
} from "@nexo/shared";
import type { z } from "zod";

/**
 * Cliente do serviço de chamados (o legado instável).
 *
 * - Timeout por tentativa e orçamento total, para o chat não ficar pendurado.
 * - Retry com backoff exponencial + jitter em queda de rede, timeout e 5xx, respeitando Retry-After.
 * - Toda mutação leva uma chave de idempotência, gerada uma vez e repetida em cada tentativa:
 *   retry nunca duplica chamado nem comentário.
 * - Nunca lança: devolve um resultado com o número de tentativas e a duração, que vão para o
 *   DecisionTrace do agent.
 */

export type ClientErrorKind = ApiErrorCode | "bad_response";

export type CallResult<T> =
  | { ok: true; data: T; attempts: number; durationMs: number }
  | { ok: false; error: { kind: ClientErrorKind; message: string; status?: number }; attempts: number; durationMs: number };

export type TicketsClientOptions = {
  baseUrl: string;
  serviceKey: string;
  fetch?: typeof fetch;
  /** Tempo máximo de cada tentativa. */
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Tempo máximo somando todas as tentativas e esperas. */
  totalBudgetMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  newKey?: () => string;
};

const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);

export function createTicketsClient(options: TicketsClientOptions) {
  const {
    baseUrl,
    serviceKey,
    fetch: doFetch = globalThis.fetch,
    timeoutMs = 4000,
    maxAttempts = 4,
    baseDelayMs = 300,
    maxDelayMs = 3500,
    totalBudgetMs = 12_000,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random = Math.random,
    now = Date.now,
    newKey = () => crypto.randomUUID(),
  } = options;

  async function call<T>(
    method: "GET" | "POST",
    path: string,
    schema: z.ZodType<T>,
    opts: { body?: unknown; idempotencyKey?: string; notFoundAsNull?: boolean } = {},
  ): Promise<CallResult<T>> {
    const started = now();
    const headers: Record<string, string> = { [SERVICE_KEY_HEADER]: serviceKey, accept: "application/json" };
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    if (method === "POST") headers[IDEMPOTENCY_KEY_HEADER] = opts.idempotencyKey ?? newKey();

    let attempts = 0;
    let lastError: { kind: ClientErrorKind; message: string; status?: number } = {
      kind: "unavailable",
      message: "Sistema de chamados indisponível.",
    };

    while (attempts < maxAttempts) {
      attempts++;
      let retryAfterMs = 0;
      try {
        const res = await doFetch(new URL(path, baseUrl), {
          method,
          headers,
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const payload: unknown = await res.json().catch(() => undefined);

        if (res.ok) {
          const parsed = schema.safeParse(payload);
          const durationMs = now() - started;
          return parsed.success
            ? { ok: true, data: parsed.data, attempts, durationMs }
            : { ok: false, error: { kind: "bad_response", message: "Resposta fora do contrato.", status: res.status }, attempts, durationMs };
        }

        const apiError = ApiError.safeParse(payload);
        lastError = apiError.success
          ? { kind: apiError.data.error.code, message: apiError.data.error.message, status: res.status }
          : { kind: res.status >= 500 ? "unavailable" : "internal", message: `HTTP ${res.status}`, status: res.status };

        if (res.status === 404 && opts.notFoundAsNull) {
          return { ok: true, data: null as T, attempts, durationMs: now() - started };
        }
        if (!RETRYABLE_STATUS.has(res.status)) break;
        retryAfterMs = Number(res.headers.get("retry-after") ?? 0) * 1000;
      } catch (error) {
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        lastError = {
          kind: "unavailable",
          message: timedOut ? "O sistema de chamados não respondeu a tempo." : "Falha de rede ao falar com o sistema de chamados.",
        };
      }

      if (attempts >= maxAttempts) break;
      const backoff = baseDelayMs * 2 ** (attempts - 1) * (0.5 + random());
      const delay = Math.min(Math.max(backoff, retryAfterMs), maxDelayMs);
      if (now() - started + delay + timeoutMs > totalBudgetMs) break;
      await sleep(delay);
    }

    return { ok: false, error: lastError, attempts, durationMs: now() - started };
  }

  const enc = encodeURIComponent;
  const ticketPath = (employeeId: string, ticketId?: string) =>
    `/api/employees/${enc(employeeId)}/tickets${ticketId ? `/${enc(ticketId)}` : ""}`;
  type Mutation = { idempotencyKey?: string };

  return {
    findEmployeeByEmail: (email: string) =>
      call("GET", `/api/employees?email=${enc(email)}`, ApiResponses.employee.nullable(), { notFoundAsNull: true }),

    findAnalystByEmail: (email: string) =>
      call("GET", `/api/analysts?email=${enc(email)}`, ApiResponses.analyst.nullable(), { notFoundAsNull: true }),

    searchHelp: (query: string, limit = 3) =>
      call("GET", `/api/help/search?q=${enc(query)}&limit=${limit}`, ApiResponses.articles),

    listTickets: (employeeId: string, opts: { openOnly?: boolean } = {}) =>
      call("GET", `${ticketPath(employeeId)}${opts.openOnly ? "?open=true" : ""}`, ApiResponses.tickets),

    getTicket: (employeeId: string, ticketId: string) =>
      call("GET", ticketPath(employeeId, ticketId), ApiResponses.ticket.nullable(), { notFoundAsNull: true }),

    createTicket: (employeeId: string, input: CreateTicketInput, opts: Mutation = {}) =>
      call("POST", ticketPath(employeeId), ApiResponses.ticket, { body: CreateTicketInput.parse(input), ...opts }),

    addComment: (employeeId: string, ticketId: string, input: AddCommentInput, opts: Mutation = {}) =>
      call("POST", `${ticketPath(employeeId, ticketId)}/comments`, ApiResponses.ticket, {
        body: AddCommentInput.parse(input),
        ...opts,
      }),

    reopenTicket: (employeeId: string, ticketId: string, input: ReopenTicketInput, opts: Mutation = {}) =>
      call("POST", `${ticketPath(employeeId, ticketId)}/reopen`, ApiResponses.ticket, {
        body: ReopenTicketInput.parse(input),
        ...opts,
      }),

    transferTicket: (employeeId: string, ticketId: string, input: TransferTicketInput, opts: Mutation = {}) =>
      call("POST", `${ticketPath(employeeId, ticketId)}/transfer`, ApiResponses.ticket, {
        body: TransferTicketInput.parse(input),
        ...opts,
      }),
  };
}

export type TicketsClient = ReturnType<typeof createTicketsClient>;
