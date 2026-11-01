import { createTicketsClient } from "@nexo/tickets-client";
import { beforeEach, describe, expect, it } from "vitest";
import type { TicketsDb } from "../db/client";
import { listTicketsForRequester } from "../db/repo";
import { seed } from "../db/seed";
import { createTestTicketsDb } from "../db/testing/pglite";
import { LegacySimulator } from "./legacy";
import { createHandler } from "./router";

// Cliente real (@nexo/tickets-client) contra o serviço real, em memória: o caminho completo
// de retry + idempotência que o agent vai usar.

const KEY = "chave-de-teste";
const now = new Date("2026-11-04T15:00:00-03:00");
const draft = {
  type: "INC" as const,
  title: "Teams não abre",
  description: "O Teams fecha logo depois de abrir desde hoje cedo.",
  category: "software" as const,
  priority: "media" as const,
  affected: "so_eu" as const,
  priorityReason: "Atrapalha, mas dá para usar o Teams no navegador.",
};

let db: TicketsDb;
let clock: number;

beforeEach(async () => {
  db = await createTestTicketsDb();
  await seed(db, now);
  clock = 0;
});

function setup(opts: { legacy?: LegacySimulator; loseFirstResponse?: boolean }) {
  const handle = createHandler({
    db,
    serviceKey: KEY,
    legacy: opts.legacy ?? new LegacySimulator(0, 0),
    now: () => now,
  });
  let lost = !opts.loseFirstResponse;
  const fetch = (async (url: URL, init: RequestInit) => {
    const res = await handle(new Request(url, init));
    if (!lost) {
      // O legado gravou, mas a resposta se perdeu no caminho.
      lost = true;
      throw new TypeError("fetch failed");
    }
    return res;
  }) as unknown as typeof globalThis.fetch;

  return createTicketsClient({
    baseUrl: "http://tickets.test",
    serviceKey: KEY,
    fetch,
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  });
}

describe("cliente ↔ serviço de chamados", () => {
  it("atravessa uma queda de 3 s do legado e cria o chamado", async () => {
    const draws = [0.01]; // a primeira requisição derruba o serviço por 3 s
    const client = setup({ legacy: new LegacySimulator(0.1, 3000, () => draws.shift() ?? 0.99, () => clock) });

    const res = await client.createTicket("emp-ana", draft);

    expect(res.ok).toBe(true);
    expect(res.attempts).toBeGreaterThan(1);
    if (res.ok) expect(res.data.id).toMatch(/^INC-\d+$/);
  });

  it("resposta perdida depois de gravar não duplica o chamado", async () => {
    const client = setup({ loseFirstResponse: true });

    const res = await client.createTicket("emp-ana", draft);

    expect(res).toMatchObject({ ok: true, attempts: 2 });
    const created = (await listTicketsForRequester(db, "emp-ana")).filter((t) => t.title === draft.title);
    expect(created).toHaveLength(1);
  });

  it("complemento com resposta perdida não vira dois comentários", async () => {
    const client = setup({ loseFirstResponse: true });

    const res = await client.addComment("emp-ana", "INC-20311", { body: "Agora trava ao abrir o Outlook." });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.events.filter((e) => e.body === "Agora trava ao abrir o Outlook.")).toHaveLength(1);
  });

  it("privacidade vale também pelo cliente", async () => {
    const client = setup({});
    expect(await client.getTicket("emp-ana", "INC-20320")).toMatchObject({ ok: true, data: null });
  });
});
