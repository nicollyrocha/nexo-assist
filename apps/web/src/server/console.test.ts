import { decision, text } from "@nexo/agent/testing";
import { appendMessage, createConversation, getAgentState, transitionConversation } from "@nexo/db";
import { ConsoleConversation, ConsoleList, type ConversationView } from "@nexo/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as getChat } from "../app/api/chat/route";
import { POST as sendRoute } from "../app/api/chat/messages/route";
import { POST as claimRoute } from "../app/api/console/conversations/[id]/claim/route";
import { POST as closeRoute } from "../app/api/console/conversations/[id]/close/route";
import { POST as messageRoute } from "../app/api/console/conversations/[id]/messages/route";
import { POST as returnRoute } from "../app/api/console/conversations/[id]/return/route";
import { GET as detailRoute } from "../app/api/console/conversations/[id]/route";
import { GET as listRoute } from "../app/api/console/conversations/route";
import { readEvents } from "./sse";
import { loginAs, params, request, setupWeb } from "./testing";

let web: Awaited<ReturnType<typeof setupWeb>>;
let rafael: string;
let juliana: string;

beforeEach(async () => {
  web = await setupWeb();
  rafael = (await loginAs("rafael.lima@nexo.com.br")).cookie;
  juliana = (await loginAs("juliana.costa@nexo.com.br")).cookie;
});

/** Conversa da Ana aguardando atendente, com uma mensagem. */
async function waitingConversation() {
  const c = await createConversation(web.db, "emp-ana");
  await appendMessage(web.db, { conversationId: c.id, role: "funcionario", authorId: "emp-ana", content: "Quero falar com um analista", blocks: [] });
  const waiting = await transitionConversation(web.db, {
    conversationId: c.id,
    expectedVersion: c.version,
    from: "ativa",
    to: "aguardando_atendente",
    transferReason: "pedido_do_funcionario",
    summary: "Funcionária pediu analista.",
  });
  return waiting!;
}

const action = (route: typeof claimRoute, cookie: string, id: string, version: number) =>
  route(request("POST", `/api/console/conversations/${id}/x`, { cookie, body: { version } }), params(id));

describe("assumir conversa", () => {
  it("dois analistas ao mesmo tempo: um assume (200) e o outro recebe 409 conflict", async () => {
    const c = await waitingConversation();
    const [a, b] = await Promise.all([
      action(claimRoute, rafael, c.id, c.version),
      action(claimRoute, juliana, c.id, c.version),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(await loser.json()).toMatchObject({ error: { code: "conflict" } });

    const winner = ConsoleConversation.parse(await (a.status === 200 ? a : b).json());
    expect(winner.conversation.status).toBe("em_atendimento");
    expect(winner.messages.at(-1)).toMatchObject({ role: "sistema", blocks: [{ kind: "event" }] });
    expect(winner.messages.at(-1)!.content).toMatch(/(Rafael Lima|Juliana Costa) assumiu · agent pausado/);
    expect(winner.analystTier).toMatch(/N1|N2/);
  });

  it("versão desatualizada → 409", async () => {
    const c = await waitingConversation();
    expect((await action(claimRoute, rafael, c.id, c.version - 1)).status).toBe(409);
  });

  it("pode assumir uma conversa que está com o agent (passa por aguardando atendente)", async () => {
    const c = await createConversation(web.db, "emp-ana");
    const res = await action(claimRoute, rafael, c.id, c.version);
    expect(res.status).toBe(200);
    const body = ConsoleConversation.parse(await res.json());
    expect(body.conversation).toMatchObject({ status: "em_atendimento", assignedAnalystId: "ana-rafael" });
    expect(body).toMatchObject({ analystName: "Rafael Lima", analystTier: "N2", employee: { id: "emp-ana" }, ticketsAvailable: true });
    expect(body.tickets.every((t) => t.requesterId === "emp-ana")).toBe(true);
  });
});

describe("atender, devolver e encerrar", () => {
  it("só quem atende responde, devolve ou encerra; devolver reativa o agent com o que foi conversado", async () => {
    const c = await waitingConversation();
    const claimed = ConsoleConversation.parse(await (await action(claimRoute, rafael, c.id, c.version)).json());
    const v = claimed.conversation.version;

    const otherReply = await messageRoute(request("POST", "/x", { cookie: juliana, body: { text: "oi" } }), params(c.id));
    expect(otherReply.status).toBe(403);
    expect((await action(returnRoute, juliana, c.id, v)).status).toBe(403);

    const reply = await messageRoute(request("POST", "/x", { cookie: rafael, body: { text: "Oi Ana, liberei seu acesso." } }), params(c.id));
    expect(reply.status).toBe(200);
    expect(await reply.json()).toMatchObject({ role: "analista", authorName: "Rafael Lima", authorId: "ana-rafael" });

    // Funcionária vê o analista no chat e o agent continua mudo.
    const ana = (await loginAs("ana.souza@nexo.com.br")).cookie;
    const view = (await (await getChat(request("GET", "/api/chat", { cookie: ana }))).json()) as ConversationView;
    expect(view).toMatchObject({ analystName: "Rafael Lima", analystTier: "N2", conversation: { status: "em_atendimento" } });
    expect(view.messages.at(-1)).toMatchObject({ role: "analista", authorName: "Rafael Lima" });

    const back = await action(returnRoute, rafael, c.id, v);
    expect(back.status).toBe(200);
    const returned = ConsoleConversation.parse(await back.json());
    expect(returned.conversation).toMatchObject({ status: "ativa", assignedAnalystId: null });
    const state = (await getAgentState(web.db, c.id)) as { carryover: string };
    expect(state.carryover).toContain("liberei seu acesso");

    // Agent volta a responder, recebendo o resumo do atendimento.
    web.script([
      (call) => {
        expect(JSON.stringify(call.prompt)).toContain("liberei seu acesso");
        return [decision({ intent: "conversa" })];
      },
      [text("Que bom que deu certo!")],
    ]);
    const events = await readEvents(await sendRoute(request("POST", "/api/chat/messages", { cookie: ana, body: { text: "funcionou, obrigada" } })));
    expect(events.map((e) => e.type)).toContain("done");
    expect(web.modelCalls()).toBe(2);
  });

  it("encerrar exige estar atendendo; depois de encerrada não se assume de novo", async () => {
    const c = await waitingConversation();
    expect((await action(closeRoute, rafael, c.id, c.version)).status).toBe(409);
    const claimed = ConsoleConversation.parse(await (await action(claimRoute, rafael, c.id, c.version)).json());
    const closed = await action(closeRoute, rafael, c.id, claimed.conversation.version);
    expect(closed.status).toBe(200);
    const body = ConsoleConversation.parse(await closed.json());
    expect(body.conversation.status).toBe("encerrada");
    expect(body.messages.at(-1)!.content).toBe("Rafael Lima encerrou a conversa");
    expect((await action(claimRoute, juliana, c.id, body.conversation.version)).status).toBe(409);
  });
});

describe("lista e detalhe", () => {
  it("filtra, conta e busca por nome sem acento", async () => {
    await waitingConversation();
    const active = await createConversation(web.db, "emp-carla");
    await appendMessage(web.db, { conversationId: active.id, role: "funcionario", authorId: "emp-carla", content: "VPN caindo", blocks: [] });
    await createConversation(web.db, "emp-carla"); // sem mensagens: não aparece

    const list = async (query: string) =>
      ConsoleList.parse(await (await listRoute(request("GET", `/api/console/conversations${query}`, { cookie: rafael }))).json());

    const all = await list("");
    expect(all.counts).toEqual({ todas: 2, para_voce: 1, com_agent: 1, minhas: 0 });
    expect(all.conversations).toHaveLength(2);
    expect((await list("?filter=com_agent")).conversations.map((c) => c.employee.name)).toEqual(["Carla Mendes"]);
    expect((await list("?q=SOUZA")).conversations.map((c) => c.employee.name)).toEqual(["Ana Souza"]);
    expect((await list("?q=vpn")).conversations.map((c) => c.employee.name)).toEqual(["Carla Mendes"]);
    expect((await listRoute(request("GET", "/api/console/conversations?filter=xyz", { cookie: rafael }))).status).toBe(400);
  });

  it("serviço de chamados fora: detalhe sai com ticketsAvailable=false em vez de lista vazia", async () => {
    const c = await waitingConversation();
    await web.deps.directory.employee("emp-ana"); // nome já conhecido (ex.: carregado pela lista)
    web.tickets.setUnavailable(true);
    const res = await detailRoute(request("GET", "/x", { cookie: rafael }), params(c.id));
    expect(res.status).toBe(200);
    expect(ConsoleConversation.parse(await res.json())).toMatchObject({ ticketsAvailable: false, tickets: [] });
  });

  it("conversa inexistente → 404", async () => {
    const res = await detailRoute(request("GET", "/x", { cookie: rafael }), params("nao-existe"));
    expect(res.status).toBe(404);
  });
});
