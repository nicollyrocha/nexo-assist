import { MAX_MESSAGES_PER_SESSION, type ConsoleFilter, type DecisionTrace } from "@nexo/shared";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  appendMessage,
  countConversationsByFilter,
  countSessionMessage,
  createConversation,
  createSession,
  deleteSession,
  findResumableConversation,
  getActiveSession,
  getAgentState,
  getConversationById,
  getConversationForEmployee,
  getSessionMessageCount,
  listConversationsForConsole,
  listMessagesForConversation,
  listMessagesForEmployee,
  listTracesForConversation,
  saveAgentState,
  saveTrace,
  transitionConversation,
  type Db,
} from "./repo";
import { sessions } from "./schema";
import { createTestDb } from "./testing/pglite";

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe("isolamento entre funcionários", () => {
  it("um funcionário não lê a conversa nem as mensagens de outro", async () => {
    const ana = await createConversation(db, "emp-ana");
    await appendMessage(db, {
      conversationId: ana.id,
      role: "funcionario",
      authorId: "emp-ana",
      content: "Minha senha do SAP bloqueou",
    });

    expect(await getConversationForEmployee(db, "emp-bruno", ana.id)).toBeNull();
    expect(await listMessagesForEmployee(db, "emp-bruno", ana.id)).toBeNull();
    expect(await listMessagesForEmployee(db, "emp-ana", ana.id)).toHaveLength(1);
  });
});

describe("retomar conversa (história 6)", () => {
  it("devolve a conversa não encerrada mais recente do próprio funcionário", async () => {
    const older = await createConversation(db, "emp-ana");
    const newer = await createConversation(db, "emp-ana");
    await createConversation(db, "emp-bruno");
    await appendMessage(db, { conversationId: newer.id, role: "funcionario", authorId: "emp-ana", content: "oi" });

    expect((await findResumableConversation(db, "emp-ana"))?.id).toBe(newer.id);
    expect(older.id).not.toBe(newer.id);
  });

  it("ignora conversas encerradas", async () => {
    const c = await createConversation(db, "emp-ana");
    await transitionConversation(db, { conversationId: c.id, expectedVersion: 0, from: "ativa", to: "encerrada" });
    expect(await findResumableConversation(db, "emp-ana")).toBeNull();
  });
});

describe("transferência e atendimento", () => {
  it("dois analistas não assumem a mesma conversa", async () => {
    const c = await createConversation(db, "emp-ana");
    const waiting = await transitionConversation(db, {
      conversationId: c.id,
      expectedVersion: 0,
      from: "ativa",
      to: "aguardando_atendente",
      transferReason: "chamado_vencido",
      summary: "INC-20311 sem atualização há 6 dias.",
    });
    expect(waiting?.status).toBe("aguardando_atendente");

    const claim = (analystId: string) =>
      transitionConversation(db, {
        conversationId: c.id,
        expectedVersion: waiting!.version,
        from: "aguardando_atendente",
        to: "em_atendimento",
        analystId,
      });
    const [rafael, juliana] = await Promise.all([claim("ana-rafael"), claim("ana-juliana")]);

    expect([rafael, juliana].filter(Boolean)).toHaveLength(1);
  });

  it("recusa transição fora do ciclo", async () => {
    const c = await createConversation(db, "emp-ana");
    expect(
      await transitionConversation(db, { conversationId: c.id, expectedVersion: 0, from: "ativa", to: "em_atendimento" }),
    ).toBeNull();
  });
});

describe("limite de mensagens por sessão", () => {
  it(`aceita ${MAX_MESSAGES_PER_SESSION} mensagens e recusa a seguinte`, async () => {
    const [session] = await db
      .insert(sessions)
      .values({ userId: "emp-ana", role: "funcionario", expiresAt: new Date(Date.now() + 3_600_000) })
      .returning();

    let last: number | null = null;
    for (let i = 0; i < MAX_MESSAGES_PER_SESSION; i++) last = await countSessionMessage(db, session!.id);
    expect(last).toBe(MAX_MESSAGES_PER_SESSION);
    expect(await countSessionMessage(db, session!.id)).toBeNull();
  });
});

// ---- Sessões, traces, estado do agent e console ------------------------------------------

const makeTrace = (conversationId: string, over: Partial<DecisionTrace> = {}): DecisionTrace => ({
  id: randomUUID(),
  conversationId,
  understanding: "Quer saber o status do chamado da VPN.",
  intent: "consultar_chamado",
  actions: [],
  outcome: "respondeu",
  confidence: { level: "alta", score: 0.9, reason: "pedido claro" },
  rationale: "Consultei os chamados do funcionário.",
  rulesApplied: [],
  alternativesDiscarded: [],
  usage: {
    model: "google/gemini-flash",
    inputTokens: 1200,
    outputTokens: 150,
    cacheReadTokens: 800,
    cacheWriteTokens: 0,
    latencyMs: 900,
  },
  createdAt: new Date().toISOString(),
  ...over,
});

describe("sessões", () => {
  it("cria, lê, conta e apaga; sessão expirada ou id inválido não volta", async () => {
    const s = await createSession(db, { userId: "emp-ana", role: "funcionario", ttlMs: 3_600_000 });
    expect((await getActiveSession(db, s.id))?.userId).toBe("emp-ana");
    expect(await getSessionMessageCount(db, s.id)).toBe(0);
    await countSessionMessage(db, s.id);
    expect(await getSessionMessageCount(db, s.id)).toBe(1);

    const expired = await createSession(db, { userId: "emp-ana", role: "funcionario", ttlMs: -1000 });
    expect(await getActiveSession(db, expired.id)).toBeNull();
    expect(await getActiveSession(db, "nao-e-uuid")).toBeNull();

    await deleteSession(db, s.id);
    expect(await getActiveSession(db, s.id)).toBeNull();
    expect(await getSessionMessageCount(db, s.id)).toBeNull();
  });
});

describe("estado do agent", () => {
  it("salva e lê o estado opaco; começa nulo", async () => {
    const c = await createConversation(db, "emp-ana");
    expect(await getAgentState(db, c.id)).toBeNull();
    const state = { pendingAction: { id: "a1", kind: "create" }, turns: 3 };
    await saveAgentState(db, c.id, state);
    expect(await getAgentState(db, c.id)).toEqual(state);
    await saveAgentState(db, c.id, null);
    expect(await getAgentState(db, c.id)).toBeNull();
  });
});

describe("saveTrace", () => {
  it("usa o id do trace e preenche as colunas extraídas", async () => {
    const c = await createConversation(db, "emp-ana");
    const trace = makeTrace(c.id, {
      intent: "falar_com_analista",
      outcome: "transferiu",
      confidence: { level: "baixa", score: 0.4, reason: "ambíguo" },
    });
    const id = await saveTrace(db, c.id, trace);
    expect(id).toBe(trace.id);

    const [row] = await listTracesForConversation(db, c.id);
    expect(row).toMatchObject({
      id: trace.id,
      intent: "falar_com_analista",
      outcome: "transferiu",
      confidenceLevel: "baixa",
      transferred: true,
      inputTokens: 1200,
      outputTokens: 150,
      cacheReadTokens: 800,
    });
    expect(row!.confidenceScore).toBeCloseTo(0.4);
    expect(row!.trace).toEqual(trace);
  });

  it("marca transferred pela ação transfer_to_analyst, mas não quando ela falhou", async () => {
    const c = await createConversation(db, "emp-ana");
    const action = (outcome: "ok" | "erro") => ({
      tool: "transfer_to_analyst" as const,
      label: "transferiu para o analista",
      inputSummary: "caso crítico",
      outcome,
      resultSummary: "",
      durationMs: 10,
      attempts: 1,
    });
    await saveTrace(db, c.id, makeTrace(c.id, { actions: [action("ok")] }));
    await saveTrace(db, c.id, makeTrace(c.id, { actions: [action("erro")], outcome: "falhou" }));
    await saveTrace(db, c.id, makeTrace(c.id));
    expect((await listTracesForConversation(db, c.id)).map((t) => t.transferred)).toEqual([true, false, false]);
  });

  it("gera id próprio quando o trace não traz uuid", async () => {
    const c = await createConversation(db, "emp-ana");
    const id = await saveTrace(db, c.id, makeTrace(c.id, { id: "trace-1" }));
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("console do analista", () => {
  const toWaiting = (conversationId: string, version = 0) =>
    transitionConversation(db, {
      conversationId,
      expectedVersion: version,
      from: "ativa",
      to: "aguardando_atendente",
      transferReason: "baixa_confianca",
    });

  /** Ativa (Ana), aguardando (Bruno), em_atendimento com Rafael (Carla) e com Juliana (Davi), encerrada (Eva). */
  async function scenario() {
    const ativa = await createConversation(db, "emp-ana");
    await appendMessage(db, { conversationId: ativa.id, role: "funcionario", authorId: "emp-ana", content: "oi" });
    await appendMessage(db, { conversationId: ativa.id, role: "agent", content: "Olá! Como posso ajudar?" });
    await saveTrace(db, ativa.id, makeTrace(ativa.id, { confidence: { level: "alta", score: 0.95, reason: "" } }));
    await saveTrace(db, ativa.id, makeTrace(ativa.id, { confidence: { level: "media", score: 0.7, reason: "" } }));

    const waitingConv = await createConversation(db, "emp-bruno");
    const longText = "Minha   VPN\ncai " + "toda hora ".repeat(30);
    await appendMessage(db, {
      conversationId: waitingConv.id,
      role: "funcionario",
      authorId: "emp-bruno",
      content: longText,
    });
    const waiting = (await toWaiting(waitingConv.id))!;

    const assign = async (employeeId: string, analystId: string) => {
      const conv = await createConversation(db, employeeId);
      const w = await toWaiting(conv.id);
      await transitionConversation(db, {
        conversationId: conv.id,
        expectedVersion: w!.version,
        from: "aguardando_atendente",
        to: "em_atendimento",
        analystId,
      });
      return conv;
    };
    const rafael = await assign("emp-carla", "ana-rafael");
    const juliana = await assign("emp-davi", "ana-juliana");

    const closed = await createConversation(db, "emp-eva");
    await transitionConversation(db, { conversationId: closed.id, expectedVersion: 0, from: "ativa", to: "encerrada" });

    return { ativa, waiting, rafael, juliana, closed };
  }

  it("filtra por status; 'minhas' não traz conversa de outro analista", async () => {
    const s = await scenario();
    const ids = async (filter: ConsoleFilter) =>
      (await listConversationsForConsole(db, { filter, analystId: "ana-rafael" })).map((r) => r.conversation.id);

    expect(await ids("para_voce")).toEqual([s.waiting.id]);
    expect(await ids("com_agent")).toEqual([s.ativa.id]);
    expect(await ids("minhas")).toEqual([s.rafael.id]);
    const todas = await ids("todas");
    expect(todas).toHaveLength(4);
    expect(todas).not.toContain(s.closed.id);
    // Última atividade primeiro: a de Juliana foi a última não encerrada a mudar; a de Ana, a primeira.
    expect(todas[0]).toBe(s.juliana.id);
    expect(todas.at(-1)).toBe(s.ativa.id);
  });

  it("traz última mensagem com preview curto, menor confiança e 'aguardando desde'", async () => {
    const s = await scenario();
    const all = await listConversationsForConsole(db, { filter: "todas", analystId: "ana-rafael" });
    const byId = new Map(all.map((r) => [r.conversation.id, r]));

    const ativa = byId.get(s.ativa.id)!;
    expect(ativa.lastMessage).toMatchObject({ preview: "Olá! Como posso ajudar?", role: "agent" });
    expect(ativa.lastMessage!.createdAt).toBeInstanceOf(Date);
    expect(ativa.minConfidence).toBeCloseTo(0.7);
    expect(ativa.waitingSince).toBeNull();

    const waiting = byId.get(s.waiting.id)!;
    expect(waiting.lastMessage!.role).toBe("funcionario");
    expect(waiting.lastMessage!.preview.length).toBeLessThanOrEqual(120);
    expect(waiting.lastMessage!.preview.startsWith("Minha VPN cai toda hora")).toBe(true);
    expect(waiting.lastMessage!.preview.endsWith("…")).toBe(true);
    expect(waiting.minConfidence).toBeNull();
    expect(waiting.waitingSince).toEqual(s.waiting.statusChangedAt);

    const rafael = byId.get(s.rafael.id)!;
    expect(rafael.lastMessage).toBeNull();
    expect(rafael.waitingSince).toBeNull();
  });

  it("'aguardando desde' não muda quando o funcionário manda mais mensagens", async () => {
    const s = await scenario();
    await appendMessage(db, {
      conversationId: s.waiting.id,
      role: "funcionario",
      authorId: "emp-bruno",
      content: "alô?",
    });
    const [row] = await listConversationsForConsole(db, { filter: "para_voce", analystId: "ana-rafael" });
    expect(row!.lastMessage!.preview).toBe("alô?");
    expect(row!.waitingSince).toEqual(s.waiting.statusChangedAt);
  });

  it("respeita o limite", async () => {
    await scenario();
    expect(await listConversationsForConsole(db, { filter: "todas", analystId: "x", limit: 2 })).toHaveLength(2);
  });

  it("conta cada filtro", async () => {
    await scenario();
    expect(await countConversationsByFilter(db, "ana-rafael")).toEqual({
      todas: 4,
      para_voce: 1,
      com_agent: 1,
      minhas: 1,
    });
    expect((await countConversationsByFilter(db, "ana-ninguem")).minhas).toBe(0);
  });

  it("lê conversa, mensagens e traces por id (analista); id inválido não quebra", async () => {
    const s = await scenario();
    expect((await getConversationById(db, s.ativa.id))?.employeeId).toBe("emp-ana");
    expect(await listMessagesForConversation(db, s.ativa.id)).toHaveLength(2);
    expect(await listTracesForConversation(db, s.ativa.id)).toHaveLength(2);
    expect(await getConversationById(db, "nao-e-uuid")).toBeNull();
    expect(await listMessagesForConversation(db, "nao-e-uuid")).toEqual([]);
  });
});

describe("devolver ao agent", () => {
  it("limpa o analista atribuído com analystId: null", async () => {
    const c = await createConversation(db, "emp-ana");
    const w = await transitionConversation(db, {
      conversationId: c.id,
      expectedVersion: 0,
      from: "ativa",
      to: "aguardando_atendente",
    });
    const taken = await transitionConversation(db, {
      conversationId: c.id,
      expectedVersion: w!.version,
      from: "aguardando_atendente",
      to: "em_atendimento",
      analystId: "ana-rafael",
    });
    expect(taken?.assignedAnalystId).toBe("ana-rafael");
    const back = await transitionConversation(db, {
      conversationId: c.id,
      expectedVersion: taken!.version,
      from: "em_atendimento",
      to: "ativa",
      analystId: null,
    });
    expect(back).toMatchObject({ status: "ativa", assignedAnalystId: null, version: taken!.version + 1 });
  });
});

describe("isolamento continua valendo com o estado novo", () => {
  it("funcionário não acessa nem retoma conversa alheia, mesmo com traces e estado salvos", async () => {
    const ana = await createConversation(db, "emp-ana");
    await appendMessage(db, { conversationId: ana.id, role: "funcionario", authorId: "emp-ana", content: "segredo" });
    await saveTrace(db, ana.id, makeTrace(ana.id));
    await saveAgentState(db, ana.id, { draft: "x" });

    expect(await getConversationForEmployee(db, "emp-bruno", ana.id)).toBeNull();
    expect(await listMessagesForEmployee(db, "emp-bruno", ana.id)).toBeNull();
    expect(await findResumableConversation(db, "emp-bruno")).toBeNull();
    expect((await findResumableConversation(db, "emp-ana"))?.id).toBe(ana.id);
  });
});
