import { describe, expect, it } from "vitest";
import { createTicketsClient } from "./client";

type Step = { status: number; body?: unknown; headers?: Record<string, string> } | "network" | "timeout";

/** fetch falso que responde a sequência de passos e registra o que recebeu. */
function fakeFetch(steps: Step[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: URL, init: RequestInit) => {
    calls.push({ url: url.toString(), init });
    const step = steps.shift() ?? { status: 500 };
    if (step === "network") throw new TypeError("fetch failed");
    if (step === "timeout") throw new DOMException("timeout", "TimeoutError");
    return Response.json(step.body ?? {}, { status: step.status, headers: step.headers });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const article = { id: "KB-001", title: "VPN", body: "Reinstale.", category: "rede_vpn" };
const unavailable = { status: 503, body: { error: { code: "unavailable", message: "fora" } }, headers: { "retry-after": "3" } };

function client(steps: Step[]) {
  const fetch = fakeFetch(steps);
  const delays: number[] = [];
  let clock = 0;
  const c = createTicketsClient({
    baseUrl: "http://tickets.test",
    serviceKey: "k",
    fetch: fetch.fn,
    sleep: async (ms) => {
      delays.push(ms);
      clock += ms;
    },
    random: () => 0.5,
    now: () => clock,
    newKey: () => "chave-gerada",
  });
  return { c, calls: fetch.calls, delays };
}

describe("retry no legado instável", () => {
  it("tenta de novo após 503 e conta as tentativas", async () => {
    const { c, delays } = client([unavailable, { status: 200, body: [article] }]);
    const res = await c.searchHelp("vpn");
    expect(res).toMatchObject({ ok: true, attempts: 2 });
    expect(delays).toEqual([3000]); // respeita o Retry-After
  });

  it("tenta de novo após falha de rede e timeout", async () => {
    const { c } = client(["network", "timeout", { status: 200, body: [article] }]);
    expect(await c.searchHelp("vpn")).toMatchObject({ ok: true, attempts: 3 });
  });

  it("desiste após o máximo de tentativas e diz que está indisponível", async () => {
    const { c, calls } = client(["network", "network", "network", "network", "network"]);
    const res = await c.searchHelp("vpn");
    expect(res).toMatchObject({ ok: false, attempts: 4, error: { kind: "unavailable" } });
    expect(calls).toHaveLength(4);
  });

  it("para antes de estourar o orçamento total de tempo", async () => {
    const { c, calls } = client([unavailable, unavailable, unavailable, unavailable]);
    const res = await c.searchHelp("vpn");
    expect(res.ok).toBe(false);
    expect(calls.length).toBeLessThan(4); // 3 s de espera + 4 s de timeout por tentativa estoura 12 s
  });

  it("não repete erro de regra de negócio", async () => {
    const { c, calls } = client([
      { status: 409, body: { error: { code: "reopen_window_expired", message: "Mais de 7 dias." } } },
    ]);
    const res = await c.reopenTicket("emp-ana", "INC-19877", { reason: "voltou" });
    expect(res).toMatchObject({ ok: false, attempts: 1, error: { kind: "reopen_window_expired", status: 409 } });
    expect(calls).toHaveLength(1);
  });
});

describe("idempotência", () => {
  it("usa a mesma chave em todas as tentativas de uma criação", async () => {
    const { c, calls } = client([unavailable, "timeout", { status: 201, body: {} }]);
    await c.createTicket("emp-ana", {
      type: "INC",
      title: "VPN",
      description: "Erro 809",
      category: "rede_vpn",
      priority: "alta",
      affected: "so_eu",
      priorityReason: "Reunião hoje",
    });
    const keys = calls.map((call) => new Headers(call.init.headers).get("idempotency-key"));
    expect(keys).toEqual(["chave-gerada", "chave-gerada", "chave-gerada"]);
  });
});

describe("contrato", () => {
  it("404 em busca por chamado vira null, não erro", async () => {
    const { c } = client([{ status: 404, body: { error: { code: "not_found", message: "x" } } }]);
    expect(await c.getTicket("emp-ana", "INC-20320")).toMatchObject({ ok: true, data: null });
  });

  it("busca funcionário e analista por id (404 vira null)", async () => {
    const employee = { id: "emp-ana", name: "Ana Souza", email: "ana.souza@nexo.com.br", department: "Financeiro" };
    const { c, calls } = client([{ status: 200, body: employee }, { status: 404, body: { error: { code: "not_found", message: "x" } } }]);
    expect(await c.getEmployee("emp-ana")).toMatchObject({ ok: true, data: employee });
    expect(await c.getAnalyst("ana-x")).toMatchObject({ ok: true, data: null });
    expect(calls.map((x) => x.url)).toEqual(["http://tickets.test/api/employees/emp-ana", "http://tickets.test/api/analysts/ana-x"]);
  });

  it("resposta fora do contrato é erro explícito", async () => {
    const { c } = client([{ status: 200, body: [{ id: 1 }] }]);
    expect(await c.searchHelp("vpn")).toMatchObject({ ok: false, error: { kind: "bad_response" } });
  });

  it("envia a chave de serviço e escapa os parâmetros", async () => {
    const { c, calls } = client([{ status: 200, body: [] }]);
    await c.listTickets("emp ana/../x", { openOnly: true });
    expect(calls[0]!.url).toBe("http://tickets.test/api/employees/emp%20ana%2F..%2Fx/tickets?open=true");
    expect(new Headers(calls[0]!.init.headers).get("x-service-key")).toBe("k");
  });
});
