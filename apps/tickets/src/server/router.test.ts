import { computeDueAt, type CreateTicketInput, type TicketWithEvents } from "@nexo/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { TicketsDb } from "../db/client";
import { seed } from "../db/seed";
import { createTestTicketsDb } from "../db/testing/pglite";
import { LegacySimulator } from "./legacy";
import { createHandler } from "./router";

const now = new Date("2026-11-04T15:00:00-03:00"); // quarta-feira, horário comercial
const KEY = "chave-de-teste";
let db: TicketsDb;
let handle: (req: Request) => Promise<Response>;

beforeEach(async () => {
  db = await createTestTicketsDb();
  await seed(db, now);
  handle = createHandler({ db, serviceKey: KEY, legacy: new LegacySimulator(0, 0), now: () => now });
});

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await handle(
    new Request(`http://tickets.test${path}`, {
      method,
      headers: { "x-service-key": KEY, "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json(), headers: res.headers };
}

const draft: CreateTicketInput = {
  type: "INC",
  title: "VPN com erro 809 no Windows 11",
  description: "Desde 20/10 o notebook (Windows 11) não conecta na VPN, erro 809. Reunião às 14h.",
  category: "rede_vpn",
  priority: "alta",
  affected: "so_eu",
  priorityReason: "Impede de trabalhar e há compromisso hoje.",
};

describe("autenticação", () => {
  it("recusa chamadas sem a chave de serviço", async () => {
    const res = await call("GET", "/api/employees/emp-ana/tickets", undefined, { "x-service-key": "errada" });
    expect(res.status).toBe(401);
  });
});

describe("privacidade", () => {
  it("não entrega chamado de outro funcionário", async () => {
    expect((await call("GET", "/api/employees/emp-ana/tickets/INC-20320")).status).toBe(404);
  });

  it("não deixa complementar chamado de outro funcionário", async () => {
    const res = await call("POST", "/api/employees/emp-ana/tickets/INC-20320/comments", { body: "oi" });
    expect(res.status).toBe(404);
  });
});

describe("abrir chamado", () => {
  it("cria com código, status e prazo calculados pelo serviço", async () => {
    const res = await call("POST", "/api/employees/emp-ana/tickets", draft, { "idempotency-key": "k1" });
    const ticket = res.body as TicketWithEvents;
    expect(res.status).toBe(201);
    expect(ticket.id).toBe("INC-20600");
    expect(ticket.status).toBe("aberto");
    expect(ticket.dueAt).toBe(computeDueAt("alta", now).toISOString());
    expect(ticket.events[0]?.body).toContain("Impede de trabalhar");
  });

  it("repetir com a mesma chave não duplica (retry do cliente)", async () => {
    const first = await call("POST", "/api/employees/emp-ana/tickets", draft, { "idempotency-key": "k1" });
    const retry = await call("POST", "/api/employees/emp-ana/tickets", draft, { "idempotency-key": "k1" });
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(first.body.id);
    const list = await call("GET", "/api/employees/emp-ana/tickets?open=true");
    expect(list.body.filter((t: { title: string }) => t.title === draft.title)).toHaveLength(1);
  });

  it("rejeita rascunho incompleto", async () => {
    const res = await call("POST", "/api/employees/emp-ana/tickets", { ...draft, category: "rh" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
  });
});

describe("complementar chamado", () => {
  it("registra o comentário uma única vez mesmo com retry", async () => {
    const path = "/api/employees/emp-ana/tickets/INC-20311/comments";
    await call("POST", path, { body: "Agora o Excel fecha sozinho." }, { "idempotency-key": "c1" });
    const res = await call("POST", path, { body: "Agora o Excel fecha sozinho." }, { "idempotency-key": "c1" });
    const comments = (res.body as TicketWithEvents).events.filter((e) => e.body === "Agora o Excel fecha sozinho.");
    expect(comments).toHaveLength(1);
  });

  it("reclassificar a prioridade recalcula o prazo", async () => {
    const res = await call("POST", "/api/employees/emp-ana/tickets/INC-20298/comments", {
      body: "A equipe toda perdeu acesso agora.",
      priority: "critica",
      priorityReason: "Equipe inteira parada.",
    });
    expect(res.body.priority).toBe("critica");
    expect(new Date(res.body.dueAt).getTime()).toBeLessThan(new Date("2026-11-04T15:00:00-03:00").getTime());
  });

  it("não complementa chamado resolvido: precisa reabrir", async () => {
    const res = await call("POST", "/api/employees/emp-ana/tickets/INC-20150/comments", { body: "Bloqueou de novo" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ticket_closed");
  });
});

describe("reabrir chamado (Anexo A: até 7 dias)", () => {
  it("reabre resolvido há 4 dias com novo prazo", async () => {
    const res = await call("POST", "/api/employees/emp-ana/tickets/INC-20150/reopen", { reason: "Bloqueou de novo." });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("aberto");
    expect(res.body.dueAt).toBe(computeDueAt("media", now).toISOString());
  });

  it("recusa resolvido há mais de 7 dias", async () => {
    const res = await call("POST", "/api/employees/emp-ana/tickets/INC-19877/reopen", { reason: "Voltou." });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("reopen_window_expired");
  });
});

describe("transferir chamado", () => {
  it("encaminha ao Suporte N2 com o resumo do caso", async () => {
    const res = await call("POST", "/api/employees/emp-ana/tickets/INC-20311/transfer", {
      reason: "chamado_vencido",
      summary: "Sem atualização há 6 dias; funcionária pediu analista.",
    });
    expect(res.body.status).toBe("aguardando_analista");
    expect(res.body.assignedTeam).toBe("Suporte N2");
    expect(res.body.events.at(-1).kind).toBe("transferencia");
  });
});

describe("central de ajuda e login", () => {
  it("busca artigos e encontra funcionário por e-mail", async () => {
    expect((await call("GET", "/api/help/search?q=vpn%20erro%20809")).body[0].id).toBe("KB-001");
    expect((await call("GET", "/api/employees?email=ana.souza@nexo.com.br")).body.id).toBe("emp-ana");
    expect((await call("GET", "/api/employees?email=x@y.com")).status).toBe(404);
  });
});

describe("funcionário e analista por id", () => {
  it("encontra pelo id e devolve 404 quando não existe", async () => {
    expect((await call("GET", "/api/employees/emp-ana")).body).toMatchObject({ id: "emp-ana", name: "Ana Souza" });
    expect((await call("GET", "/api/employees/emp-nao-existe")).status).toBe(404);
    expect((await call("GET", "/api/analysts/ana-rafael")).body).toMatchObject({ id: "ana-rafael", tier: "N2" });
    expect((await call("GET", "/api/analysts/emp-ana")).status).toBe(404);
  });
});

describe("legado instável", () => {
  it("fica fora do ar durante a queda e volta depois", async () => {
    let clock = 0;
    const draws = [0.01]; // primeira requisição derruba o serviço
    handle = createHandler({
      db,
      serviceKey: KEY,
      legacy: new LegacySimulator(0.1, 3000, () => draws.shift() ?? 0.99, () => clock),
    });

    const down = await call("GET", "/api/employees/emp-ana/tickets");
    expect(down.status).toBe(503);
    expect(down.headers.get("retry-after")).toBe("3");

    clock = 2000;
    expect((await call("GET", "/api/employees/emp-ana/tickets")).status).toBe(503);

    clock = 3001;
    expect((await call("GET", "/api/employees/emp-ana/tickets")).status).toBe(200);
  });
});
