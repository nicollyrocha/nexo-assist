import {
  AddCommentInput,
  CreateTicketInput,
  IDEMPOTENCY_KEY_HEADER,
  ReopenTicketInput,
  SERVICE_KEY_HEADER,
  TransferTicketInput,
  type ApiError,
} from "@nexo/shared";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { TicketsDb } from "../db/client";
import {
  findAnalystByEmail,
  findEmployeeByEmail,
  getAnalystById,
  getEmployeeById,
  listTicketsForRequester,
  searchHelpArticles,
} from "../db/repo";
import type { LegacySimulator } from "./legacy";
import {
  ServiceError,
  addComment,
  createTicket,
  getTicketWithEvents,
  reopenTicket,
  transferTicket,
} from "./operations";

export type Deps = {
  db: TicketsDb;
  serviceKey: string;
  legacy: LegacySimulator;
  now?: () => Date;
};

type Ctx = { req: Request; url: URL; params: string[]; deps: Deps };
type Handler = (ctx: Ctx) => Promise<Response>;

const json = (body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, { status, headers });

const error = (code: ApiError["error"]["code"], message: string, status: number, headers?: HeadersInit) =>
  json({ error: { code, message } } satisfies ApiError, status, headers);

const SEGMENT = "([A-Za-z0-9_-]+)";
const route = (method: string, pattern: string, handler: Handler) => ({
  method,
  regex: new RegExp(`^${pattern.replaceAll(":p", SEGMENT)}$`),
  handler,
});

const keyOf = (req: Request) => req.headers.get(IDEMPOTENCY_KEY_HEADER);
const nowOf = (deps: Deps) => deps.now?.() ?? new Date();

async function body<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) throw new ServiceError("invalid_input", z.prettifyError(parsed.error), 400);
  return parsed.data;
}

const routes = [
  route("GET", "/api/employees", async ({ url, deps }) => {
    const employee = await findEmployeeByEmail(deps.db, url.searchParams.get("email") ?? "");
    return employee ? json(employee) : error("not_found", "Funcionário não encontrado.", 404);
  }),
  route("GET", "/api/analysts", async ({ url, deps }) => {
    const analyst = await findAnalystByEmail(deps.db, url.searchParams.get("email") ?? "");
    return analyst ? json(analyst) : error("not_found", "Analista não encontrado.", 404);
  }),
  route("GET", "/api/employees/:p", async ({ params: [id], deps }) => {
    const employee = await getEmployeeById(deps.db, id!);
    return employee ? json(employee) : error("not_found", "Funcionário não encontrado.", 404);
  }),
  route("GET", "/api/analysts/:p", async ({ params: [id], deps }) => {
    const analyst = await getAnalystById(deps.db, id!);
    return analyst ? json(analyst) : error("not_found", "Analista não encontrado.", 404);
  }),
  route("GET", "/api/help/search", async ({ url, deps }) => {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 3) || 3, 10);
    return json(await searchHelpArticles(deps.db, url.searchParams.get("q") ?? "", limit));
  }),
  route("GET", "/api/employees/:p/tickets", async ({ url, params: [employeeId], deps }) =>
    json(await listTicketsForRequester(deps.db, employeeId!, { openOnly: url.searchParams.get("open") === "true" })),
  ),
  route("GET", "/api/employees/:p/tickets/:p", async ({ params: [employeeId, ticketId], deps }) => {
    const ticket = await getTicketWithEvents(deps.db, employeeId!, ticketId!);
    return ticket ? json(ticket) : error("not_found", `Chamado ${ticketId} não encontrado para este funcionário.`, 404);
  }),
  route("POST", "/api/employees/:p/tickets", async ({ req, params: [employeeId], deps }) => {
    const input = await body(req, CreateTicketInput);
    const { ticket, created } = await createTicket(deps.db, employeeId!, input, keyOf(req), nowOf(deps));
    return json(ticket, created ? 201 : 200);
  }),
  route("POST", "/api/employees/:p/tickets/:p/comments", async ({ req, params: [employeeId, ticketId], deps }) =>
    json(await addComment(deps.db, employeeId!, ticketId!, await body(req, AddCommentInput), keyOf(req), nowOf(deps))),
  ),
  route("POST", "/api/employees/:p/tickets/:p/reopen", async ({ req, params: [employeeId, ticketId], deps }) =>
    json(await reopenTicket(deps.db, employeeId!, ticketId!, await body(req, ReopenTicketInput), keyOf(req), nowOf(deps))),
  ),
  route("POST", "/api/employees/:p/tickets/:p/transfer", async ({ req, params: [employeeId, ticketId], deps }) =>
    json(await transferTicket(deps.db, employeeId!, ticketId!, await body(req, TransferTicketInput), keyOf(req), nowOf(deps))),
  ),
];

function authorized(req: Request, serviceKey: string) {
  const given = Buffer.from(req.headers.get(SERVICE_KEY_HEADER) ?? "");
  const expected = Buffer.from(serviceKey);
  return serviceKey.length > 0 && given.length === expected.length && timingSafeEqual(given, expected);
}

/** Ponto de entrada HTTP do serviço: autenticação, queda simulada do legado, roteamento e erros. */
export function createHandler(deps: Deps | (() => Deps)) {
  return async (req: Request): Promise<Response> => {
    const d = typeof deps === "function" ? deps() : deps;
    if (!authorized(req, d.serviceKey)) return error("unauthorized", "Chave de serviço inválida.", 401);

    const downMs = d.legacy.check();
    if (downMs > 0) {
      return error("unavailable", "Sistema de chamados temporariamente indisponível.", 503, {
        "Retry-After": String(Math.ceil(downMs / 1000)),
      });
    }

    const url = new URL(req.url);
    for (const r of routes) {
      const match = r.method === req.method ? r.regex.exec(url.pathname) : null;
      if (!match) continue;
      try {
        return await r.handler({ req, url, params: match.slice(1), deps: d });
      } catch (e) {
        if (e instanceof ServiceError) return error(e.code, e.message, e.status);
        console.error("[tickets] erro inesperado", req.method, url.pathname, e);
        return error("internal", "Erro interno no serviço de chamados.", 500);
      }
    }
    return error("not_found", "Rota não encontrada.", 404);
  };
}
