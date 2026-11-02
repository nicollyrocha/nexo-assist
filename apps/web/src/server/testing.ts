import { fakeTickets, scriptedAgent } from "@nexo/agent/testing";
import { createTestDb } from "@nexo/db/testing";
import { POST as loginRoute } from "../app/api/auth/login/route";
import { type Deps, setDepsForTesting } from "./deps";
import { createDirectory } from "./directory";
import { verifySessionToken } from "./session-token";

// Ambiente de teste dos Route Handlers: PGlite com as migrações reais, serviço de chamados em
// memória (fakeTickets) e modelo roteirizado do Mastra (scriptedAgent). Sem rede nem segredos.

export const TEST_SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
const BASE = "http://web.test";

export async function setupWeb() {
  const db = await createTestDb();
  const tickets = fakeTickets(new Date());
  let scripted = scriptedAgent([]);
  const deps: Deps = {
    db,
    tickets: tickets.client,
    agent: scripted.agent,
    modelId: "modelo-roteirizado",
    sessionSecret: TEST_SECRET,
    directory: createDirectory(tickets.client),
    now: () => new Date(),
  };
  setDepsForTesting(deps);

  return {
    db,
    deps,
    tickets,
    /** Troca o roteiro do modelo; `calls()` diz quantas vezes o modelo foi chamado. */
    script(steps: Parameters<typeof scriptedAgent>[0]) {
      scripted = scriptedAgent(steps);
      deps.agent = scripted.agent;
    },
    modelCalls: () => scripted.calls.length,
  };
}

export function request(method: string, path: string, opts: { cookie?: string; body?: unknown } = {}) {
  return new Request(`${BASE}${path}`, {
    method,
    headers: {
      ...(opts.cookie && { cookie: opts.cookie }),
      ...(opts.body !== undefined && { "content-type": "application/json" }),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

/** Faz login pelo handler real e devolve o cabeçalho Cookie para as próximas requisições. */
export async function loginAs(email: string) {
  const res = await loginRoute(request("POST", "/api/auth/login", { body: { email, password: "qualquer" } }));
  if (res.status !== 200) throw new Error(`login falhou: ${res.status}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0]!;
  // O id da sessão não vem no corpo (fica só no cookie): os testes o leem do próprio token.
  const session = verifySessionToken(decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1)), TEST_SECRET);
  if (!session) throw new Error("cookie de sessão inválido");
  return { cookie, setCookie, sessionId: session.sessionId, body: (await res.json()) as { user: { userId: string } } };
}

export const params = (id: string) => ({ params: Promise.resolve({ id }) });
