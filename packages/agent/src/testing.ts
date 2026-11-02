import type { Analyst, Employee, HelpArticle, Ticket, TicketWithEvents } from "@nexo/shared";
import type { CallResult, TicketsClient } from "@nexo/tickets-client";
import { MastraLanguageModelV2Mock } from "@mastra/core/test-utils/llm-mock";
import { createNexoAgent } from "./model";

// Dublês para testar o agent sem rede: um modelo que segue um roteiro (mock de modelo do Mastra,
// passando pelo loop real de ferramentas) e um serviço de chamados em memória com as mesmas regras
// de privacidade do real.

type Block = { kind: "tool"; name: string; input: unknown } | { kind: "text"; value: string };
type ModelCall = MastraLanguageModelV2Mock["doStreamCalls"][number];
type Step = Block[] | { refusal: true } | ((call: ModelCall) => Block[]);

export const toolUse = (name: string, input: unknown): Block => ({ kind: "tool", name, input });
export const text = (value: string): Block => ({ kind: "text", value });

export const decision = (overrides: Record<string, unknown> = {}) =>
  toolUse("register_decision", {
    understanding: "Entendimento de teste",
    intent: "duvida",
    confidence: 0.9,
    confidence_reason: "Caso claro",
    rationale: "Justificativa de teste",
    rules_applied: [],
    alternatives_discarded: [],
    show_ticket_ids: [],
    ticket_selection_prompt: null,
    quick_replies: [],
    asked_for_information: false,
    ...overrides,
  });

let seq = 0;
const usage = { inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedInputTokens: 80 };

/** Agent do Mastra com um modelo roteirizado: cada passo do roteiro é uma resposta do modelo. */
export function scriptedAgent(steps: Step[]) {
  const model = new MastraLanguageModelV2Mock({
    modelId: "modelo-roteirizado",
    doStream: async (call) => {
      const step = steps.shift();
      if (!step) throw new Error("Roteiro do modelo acabou");
      const parts: unknown[] = [{ type: "stream-start", warnings: [] }];
      if ("refusal" in step) {
        parts.push({ type: "finish", finishReason: "content-filter", usage });
      } else {
        const blocks = typeof step === "function" ? step(call) : step;
        for (const b of blocks) {
          if (b.kind === "text") {
            const id = `t${++seq}`;
            parts.push({ type: "text-start", id }, { type: "text-delta", id, delta: b.value }, { type: "text-end", id });
          } else {
            parts.push({ type: "tool-call", toolCallId: `call_${++seq}`, toolName: b.name, input: JSON.stringify(b.input) });
          }
        }
        parts.push({ type: "finish", finishReason: blocks.some((b) => b.kind === "tool") ? "tool-calls" : "stop", usage });
      }
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const p of parts) controller.enqueue(p as never);
            controller.close();
          },
        }),
      };
    },
  });
  return { agent: createNexoAgent(model), calls: model.doStreamCalls };
}

export const ana: Employee = {
  id: "emp-ana",
  name: "Ana Souza",
  email: "ana.souza@nexo.com.br",
  department: "Financeiro",
};

export const carla: Employee = {
  id: "emp-carla",
  name: "Carla Mendes",
  email: "carla.mendes@nexo.com.br",
  department: "Comercial",
};

export const rafael: Analyst = { id: "ana-rafael", name: "Rafael Lima", email: "rafael.lima@nexo.com.br", tier: "N2" };
export const juliana: Analyst = { id: "ana-juliana", name: "Juliana Costa", email: "juliana.costa@nexo.com.br", tier: "N1" };

const employees = [ana, carla];
const analysts = [rafael, juliana];

const ok = <T>(data: T): CallResult<T> => ({ ok: true, data, attempts: 1, durationMs: 5 });
const down = <T>(): CallResult<T> => ({
  ok: false,
  error: { kind: "unavailable", message: "Sistema de chamados indisponível." },
  attempts: 4,
  durationMs: 9000,
});

export function fakeTickets(now: Date, opts: { unavailable?: boolean } = {}) {
  /** Pode ser alternado depois de criado (ex.: login ok, painel do console fora): ver setUnavailable. */
  const status = { unavailable: !!opts.unavailable };
  const iso = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString();
  const day = 86_400_000;
  const base = { description: "Descrição", affected: "so_eu", assignedTeam: "Suporte N1", resolvedAt: null } as const;
  const tickets: TicketWithEvents[] = [
    { ...base, id: "INC-20311", type: "INC", title: "Notebook lento após atualização do Windows", category: "hardware", priority: "media", status: "aguardando_analista", requesterId: "emp-ana", openedAt: iso(16 * day), updatedAt: iso(6 * day), dueAt: iso(2 * day), events: [] },
    { ...base, id: "INC-20298", type: "INC", title: "Acesso à pasta Financeiro", category: "acesso", priority: "media", status: "em_andamento", requesterId: "emp-ana", openedAt: iso(2 * day), updatedAt: iso(day / 6), dueAt: iso(-2 * day), events: [] },
    { ...base, id: "INC-20150", type: "INC", title: "Senha do SAP bloqueada", category: "acesso", priority: "media", status: "resolvido", requesterId: "emp-ana", openedAt: iso(5 * day), updatedAt: iso(4 * day), dueAt: null, resolvedAt: iso(4 * day), events: [] },
    { ...base, id: "INC-20320", type: "INC", title: "VPN cai a cada 10 minutos", category: "rede_vpn", priority: "alta", status: "aberto", requesterId: "emp-carla", openedAt: iso(day / 12), updatedAt: iso(day / 12), dueAt: iso(-day / 6), events: [] },
  ];
  const articles: HelpArticle[] = [
    { id: "KB-001", title: "VPN com erro 809", body: "Reinstale o cliente de VPN pelo portal de softwares e reinicie. Vale só para Windows 10; no Windows 11, abra um chamado.", category: "rede_vpn" },
    { id: "KB-002", title: "Horário do service desk", body: "De segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.", category: "outros" },
  ];
  const calls: string[] = [];
  const mine = (employeeId: string) => tickets.filter((t) => t.requesterId === employeeId);
  const created = new Map<string, TicketWithEvents>();
  let next = 20600;

  const guard = <T>(name: string, fn: () => T): Promise<CallResult<T>> => {
    calls.push(name);
    return Promise.resolve(status.unavailable ? down<T>() : ok(fn()));
  };
  const words = (q: string) => q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];

  const client: TicketsClient = {
    findEmployeeByEmail: (email) =>
      guard("findEmployeeByEmail", () => employees.find((e) => e.email === email.trim().toLowerCase()) ?? null),
    findAnalystByEmail: (email) =>
      guard("findAnalystByEmail", () => analysts.find((a) => a.email === email.trim().toLowerCase()) ?? null),
    getEmployee: (id) => guard("getEmployee", () => employees.find((e) => e.id === id) ?? null),
    getAnalyst: (id) => guard("getAnalyst", () => analysts.find((a) => a.id === id) ?? null),
    searchHelp: (q) =>
      guard("searchHelp", () =>
        articles.filter((a) => words(q).some((w) => `${a.title} ${a.body}`.toLowerCase().includes(w))),
      ),
    listTickets: (employeeId, o = {}) =>
      guard("listTickets", () => mine(employeeId).filter((t) => !o.openOnly || !["resolvido", "fechado"].includes(t.status))),
    getTicket: (employeeId, id) => guard("getTicket", () => mine(employeeId).find((t) => t.id === id) ?? null),
    createTicket: (employeeId, input, o = {}) =>
      guard("createTicket", () => {
        const key = o.idempotencyKey ?? "";
        const existing = created.get(key);
        if (existing) return existing;
        const t: TicketWithEvents = {
          id: `${input.type}-${next++}`, type: input.type, title: input.title, description: input.description,
          category: input.category, priority: input.priority, affected: input.affected, status: "aberto",
          requesterId: employeeId, assignedTeam: "Suporte N1", openedAt: now.toISOString(), updatedAt: now.toISOString(),
          dueAt: now.toISOString(), resolvedAt: null, events: [],
        };
        created.set(key, t);
        tickets.push(t);
        return t;
      }),
    addComment: (employeeId, id, input) =>
      guard("addComment", () => {
        const t = mine(employeeId).find((x) => x.id === id)!;
        t.events.push({ id: `ev-${t.events.length}`, ticketId: id, kind: "comentario", authorKind: "funcionario", authorId: employeeId, body: input.body, createdAt: now.toISOString() });
        if (input.priority) t.priority = input.priority;
        return t;
      }),
    reopenTicket: (employeeId, id) =>
      guard("reopenTicket", () => {
        const t = mine(employeeId).find((x) => x.id === id)!;
        t.status = "aberto";
        t.resolvedAt = null;
        return t;
      }),
    transferTicket: (employeeId, id) =>
      guard("transferTicket", () => {
        const t = mine(employeeId).find((x) => x.id === id)!;
        t.status = "aguardando_analista";
        return t;
      }),
  };
  return {
    client,
    tickets,
    calls,
    created: () => [...created.values()] as Ticket[],
    setUnavailable: (value: boolean) => {
      status.unavailable = value;
    },
  };
}
