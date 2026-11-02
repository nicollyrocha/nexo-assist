import type { ConsoleConversation, ConversationView, DecisionTrace, MessageBlock, MessageView, Ticket, TicketDraft } from "@nexo/shared";

// Dados de teste no formato do contrato (@nexo/shared). Datas fixas em UTC.

export const NOW = new Date("2026-10-21T13:00:00.000Z"); // 10:00 em São Paulo, quarta-feira

export function ticket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: "INC-20311",
    type: "INC",
    title: "Notebook lento após atualização do Windows",
    description: "Lentidão geral desde a atualização de 15/10.",
    category: "hardware",
    priority: "media",
    affected: "so_eu",
    status: "aguardando_analista",
    requesterId: "emp-ana",
    assignedTeam: "Suporte N1",
    openedAt: "2026-10-16T17:20:00.000Z",
    updatedAt: "2026-10-16T17:20:00.000Z",
    dueAt: "2026-10-19T17:20:00.000Z",
    resolvedAt: null,
    ...over,
  };
}

export function trace(over: Partial<DecisionTrace> = {}): DecisionTrace {
  return {
    id: "tr-1",
    conversationId: "conv-1",
    understanding: "Quer saber do INC-20311 (notebook lento).",
    intent: "consultar_chamado",
    actions: [
      {
        tool: "get_ticket",
        label: "consultou o chamado",
        inputSummary: "INC-20311",
        outcome: "ok",
        resultSummary: "aguardando_analista, prioridade media",
        durationMs: 600,
        attempts: 1,
      },
    ],
    outcome: "respondeu",
    confidence: { level: "alta", score: 0.92, reason: "Chamado identificado pelo número." },
    rationale: "Sem atualização há 5 dias, acima de 3 dias úteis.",
    rulesApplied: [{ rule: "prioridade", explanation: "Média tem prazo de 3 dias úteis." }],
    alternativesDiscarded: [],
    usage: { model: "google/gemini-2.5-flash", inputTokens: 1820, outputTokens: 140, cacheReadTokens: 1200, cacheWriteTokens: 0, latencyMs: 2400 },
    createdAt: "2026-10-21T12:59:00.000Z",
    ...over,
  };
}

export const draft: TicketDraft = {
  type: "INC",
  title: "VPN não conecta no notebook — erro 809",
  description: "Desde 20/10 o notebook (Windows 11) não conecta na VPN e mostra o erro 809.",
  category: "rede_vpn",
  priority: "alta",
  affected: "so_eu",
  priorityReason: "há uma reunião com cliente hoje às 14h.",
};

export const draftBlock: Extract<MessageBlock, { kind: "draft" }> = {
  kind: "draft",
  actionId: "act-1",
  draft,
  dueAtPreview: "2026-10-21T16:43:00.000Z",
};

export function message(over: Partial<MessageView> = {}): MessageView {
  return {
    id: "m-1",
    conversationId: "conv-1",
    role: "funcionario",
    authorId: "emp-ana",
    authorName: "Ana Souza",
    content: "Oi",
    blocks: [],
    traceId: null,
    createdAt: "2026-10-21T12:58:00.000Z",
    ...over,
  };
}

export function conversationView(over: Partial<ConversationView> = {}): ConversationView {
  return {
    conversation: {
      id: "conv-1",
      employeeId: "emp-ana",
      status: "ativa",
      assignedAnalystId: null,
      transferReason: null,
      summary: null,
      ticketId: null,
      version: 1,
      createdAt: "2026-10-21T12:50:00.000Z",
      updatedAt: "2026-10-21T12:59:00.000Z",
    },
    messages: [
      message({ id: "m-1", content: "Meu notebook não conecta na VPN. Erro 809." }),
      message({
        id: "m-2",
        role: "agent",
        authorId: null,
        authorName: "Nexo Assist",
        content: "Montei o chamado com prioridade alta. Confira antes de eu criar:",
        blocks: [draftBlock],
        traceId: "tr-1",
        createdAt: "2026-10-21T12:59:00.000Z",
      }),
    ],
    traces: {
      "tr-1": trace({
        intent: "abrir_chamado",
        outcome: "propos_rascunho",
        actions: [
          {
            tool: "propose_new_ticket",
            label: "montou o rascunho do chamado",
            inputSummary: "rede_vpn/alta",
            outcome: "ok",
            resultSummary: "proposta act-1",
            durationMs: 5,
            attempts: 1,
          },
        ],
      }),
    },
    analystName: null,
    analystTier: null,
    messagesUsed: 2,
    messagesLimit: 30,
    ...over,
  };
}

export function consoleConversation(over: Partial<ConsoleConversation> = {}): ConsoleConversation {
  const view = conversationView();
  return {
    conversation: view.conversation,
    messages: view.messages,
    traces: view.traces,
    analystName: null,
    analystTier: null,
    employee: { id: "emp-ana", name: "Ana Souza", email: "ana.souza@nexo.com.br", department: "Financeiro" },
    tickets: [ticket()],
    ticketsAvailable: true,
    ...over,
  };
}
