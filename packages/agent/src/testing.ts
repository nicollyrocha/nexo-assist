import type Anthropic from "@anthropic-ai/sdk";
import type { Employee, HelpArticle, Ticket, TicketWithEvents } from "@nexo/shared";
import type { CallResult, TicketsClient } from "@nexo/tickets-client";
import type { Message, Model, ModelRequest } from "./model";

// Dublês para testar o loop do agent sem rede: um modelo que segue um roteiro e um serviço de
// chamados em memória com as mesmas regras de privacidade do real.

type Block = Anthropic.Beta.BetaContentBlock;
type Step = Block[] | { refusal: true } | ((request: ModelRequest) => Block[]);

let seq = 0;
export const toolUse = (name: string, input: unknown): Block =>
  ({ type: "tool_use", id: `tu_${++seq}`, name, input, caller: { type: "direct" } }) as unknown as Block;
export const text = (value: string): Block => ({ type: "text", text: value, citations: null }) as unknown as Block;

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

export function scriptedModel(steps: Step[]) {
  const requests: ModelRequest[] = [];
  const model: Model = {
    id: "modelo-roteirizado",
    async complete(request, onText) {
      requests.push(structuredClone(request));
      const step = steps.shift();
      if (!step) throw new Error("Roteiro do modelo acabou");
      if ("refusal" in step) return message([], "refusal");
      const content = typeof step === "function" ? step(request) : step;
      for (const b of content) if (b.type === "text") onText(b.text);
      return message(content, content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn");
    },
  };
  return { model, requests };
}

function message(content: Block[], stop_reason: Message["stop_reason"]): Message {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "modelo-roteirizado",
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 80, cache_creation_input_tokens: 0 },
  } as unknown as Message;
}

export const ana: Employee = {
  id: "emp-ana",
  name: "Ana Souza",
  email: "ana.souza@nexo.com.br",
  department: "Financeiro",
};

const ok = <T>(data: T): CallResult<T> => ({ ok: true, data, attempts: 1, durationMs: 5 });
const down = <T>(): CallResult<T> => ({
  ok: false,
  error: { kind: "unavailable", message: "Sistema de chamados indisponível." },
  attempts: 4,
  durationMs: 9000,
});

export function fakeTickets(now: Date, opts: { unavailable?: boolean } = {}) {
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
    { id: "KB-001", title: "VPN com erro 809", body: "Reinstale o cliente de VPN. Vale só para Windows 10; no Windows 11, abra um chamado.", category: "rede_vpn" },
  ];
  const calls: string[] = [];
  const mine = (employeeId: string) => tickets.filter((t) => t.requesterId === employeeId);
  const created = new Map<string, TicketWithEvents>();
  let next = 20600;

  const guard = <T>(name: string, fn: () => T): Promise<CallResult<T>> => {
    calls.push(name);
    return Promise.resolve(opts.unavailable ? down<T>() : ok(fn()));
  };

  const client: TicketsClient = {
    findEmployeeByEmail: () => guard("findEmployeeByEmail", () => null),
    findAnalystByEmail: () => guard("findAnalystByEmail", () => null),
    searchHelp: (q) => guard("searchHelp", () => (/vpn|809/i.test(q) ? articles : [])),
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
  return { client, tickets, calls, created: () => [...created.values()] as Ticket[] };
}
