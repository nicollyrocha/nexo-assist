import { DecisionTrace, TRANSFER_REASONS, isOverdue } from "@nexo/shared";
import { beforeEach, describe, expect, it } from "vitest";
// Só no teste: confere as conversas contra o seed real do serviço de chamados (dono dos chamados).
import { buildSeed as buildTicketsSeed } from "../../../apps/tickets/src/db/seed-data";
import {
  countConversationsByFilter,
  createConversation,
  getConversationById,
  listConversationsForConsole,
  listMessagesForConversation,
  listTracesForConversation,
  type Db,
} from "./repo";
import { SEED_CONVERSATION_IDS, buildAppSeed, seedApp } from "./seed";
import { createTestDb } from "./testing/pglite";

const now = new Date("2026-11-04T15:00:00-03:00"); // quarta-feira, horário comercial
let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe("seed das conversas do console", () => {
  it("enche \"Para você\" com os quatro motivos de transferência do Anexo A", async () => {
    await seedApp(db, now);
    const rows = await listConversationsForConsole(db, { filter: "para_voce", analystId: "ana-thiago" });

    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.conversation.transferReason).sort()).toEqual([...TRANSFER_REASONS].sort());
    for (const r of rows) {
      expect(r.waitingSince).not.toBeNull();
      expect(r.lastMessage?.role).toBe("agent");
      expect(r.minConfidence).not.toBeNull();
    }
    // Baixa confiança aparece como tal no filtro do console.
    const low = rows.find((r) => r.conversation.transferReason === "baixa_confianca");
    expect(low?.minConfidence).toBeLessThan(0.6);
  });

  it("deixa uma conversa em atendimento em \"Minhas\" da analista nova", async () => {
    await seedApp(db, now);
    const mine = await listConversationsForConsole(db, { filter: "minhas", analystId: "ana-marina" });
    expect(mine).toHaveLength(1);
    expect(mine[0]?.conversation).toMatchObject({ status: "em_atendimento", assignedAnalystId: "ana-marina", version: 2 });
    expect(mine[0]?.lastMessage?.role).toBe("funcionario");
  });

  it("é idempotente: rodar duas vezes não duplica nada", async () => {
    await seedApp(db, now);
    await seedApp(db, new Date(now.getTime() + 3_600_000));
    expect(await countConversationsByFilter(db, "ana-marina")).toEqual({ todas: 5, para_voce: 4, com_agent: 0, minhas: 1 });
    for (const id of SEED_CONVERSATION_IDS) {
      const messages = await listMessagesForConversation(db, id);
      const traces = await listTracesForConversation(db, id);
      expect(traces).toHaveLength(messages.filter((m) => m.role === "agent").length);
    }
  });

  it("não apaga conversas reais", async () => {
    const real = await createConversation(db, "emp-ana");
    await seedApp(db, now);
    await seedApp(db, now);
    expect(await getConversationById(db, real.id)).not.toBeNull();
  });

  it("todo turno do agent tem trace válido ligado à mensagem", async () => {
    await seedApp(db, now);
    for (const id of SEED_CONVERSATION_IDS) {
      const traces = await listTracesForConversation(db, id);
      const traceIds = new Set(traces.map((t) => t.id));
      for (const m of await listMessagesForConversation(db, id)) {
        if (m.role === "agent") expect(traceIds.has(m.traceId!)).toBe(true);
      }
      for (const t of traces) {
        expect(DecisionTrace.parse(t.trace).conversationId).toBe(id);
        expect(t.transferred).toBe(t.trace.outcome === "transferiu");
      }
    }
  });
});

describe("isolamento: o seed só cita chamados do próprio funcionário", () => {
  const tickets = new Map(buildTicketsSeed(now).tickets.map((t) => [t.id, t]));
  const app = buildAppSeed(now);
  const TICKET_RE = /\b(?:INC|REQ)-\d+\b/g;

  it("o chamado em foco existe e é do funcionário da conversa", () => {
    for (const c of app.conversations) {
      if (!c.ticketId) continue;
      expect(tickets.get(c.ticketId)?.requesterId, c.ticketId).toBe(c.employeeId);
    }
  });

  it("nenhuma mensagem, resumo ou trace menciona chamado de outra pessoa", () => {
    for (const c of app.conversations) {
      const texts = [
        c.summary ?? "",
        ...app.messages.filter((m) => m.conversationId === c.id).map((m) => `${m.content} ${JSON.stringify(m.blocks)}`),
        ...app.traces.filter((t) => t.conversationId === c.id).map((t) => JSON.stringify(t.trace)),
      ];
      for (const id of texts.join(" ").match(TICKET_RE) ?? []) {
        expect(tickets.get(id)?.requesterId, `${id} em ${c.employeeId}`).toBe(c.employeeId);
      }
    }
  });

  it("os motivos batem com os chamados: vencido está vencido, crítico é crítico", () => {
    const byReason = new Map(app.conversations.map((c) => [c.transferReason, c]));
    const overdue = tickets.get(byReason.get("chamado_vencido")!.ticketId!)!;
    expect(isOverdue(overdue.dueAt!, now)).toBe(true);
    expect(tickets.get(byReason.get("caso_critico")!.ticketId!)?.priority).toBe("critica");
  });
});
