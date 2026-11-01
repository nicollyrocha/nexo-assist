import { MAX_MESSAGES_PER_SESSION } from "@nexo/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  appendMessage,
  countSessionMessage,
  createConversation,
  findResumableConversation,
  getConversationForEmployee,
  listMessagesForEmployee,
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
