import { DecisionTrace } from "@nexo/shared";
import { describe, expect, it } from "vitest";
import { initialAgentState, runTurn, type AgentState, type TurnInput } from "./run-turn";
import { ana, decision, fakeTickets, scriptedAgent, text, toolUse } from "./testing";

const now = new Date("2026-11-04T15:00:00-03:00");
let ids = 0;

function turn(
  steps: Parameters<typeof scriptedAgent>[0],
  userMessage: string,
  opts: { state?: AgentState; tickets?: ReturnType<typeof fakeTickets> } = {},
) {
  const tickets = opts.tickets ?? fakeTickets(now);
  const { agent, calls } = scriptedAgent(steps);
  const streamed: string[] = [];
  const chips: string[] = [];
  const input: TurnInput = {
    agent,
    modelId: "modelo-roteirizado",
    tickets: tickets.client,
    employee: ana,
    conversationId: "conv-1",
    state: opts.state ?? initialAgentState(),
    userMessage,
    now,
    onText: (d) => streamed.push(d),
    onAction: (a) => chips.push(a.label),
    newId: () => `id-${++ids}`,
  };
  return runTurn(input).then((result) => ({ result, calls, streamed, chips, tickets }));
}

describe("dúvida resolvida no chat (história 1)", () => {
  it("busca na central, registra a decisão e responde sem abrir chamado", async () => {
    const { result, streamed, chips, tickets } = await turn(
      [
        [toolUse("search_help_center", { query: "vpn erro 809" })],
        [decision({ understanding: "VPN com erro 809", rules_applied: [{ rule: "escopo", explanation: "assunto de TI" }] })],
        [text("Reinstale o cliente de VPN pelo portal de softwares.")],
      ],
      "Minha VPN dá erro 809",
    );

    expect(result.reply).toBe("Reinstale o cliente de VPN pelo portal de softwares.");
    expect(streamed.join("")).toBe(result.reply);
    expect(chips).toEqual(["buscou na central de ajuda"]);
    expect(result.trace.outcome).toBe("respondeu");
    expect(result.trace.actions[0]).toMatchObject({ tool: "search_help_center", outcome: "ok", resultSummary: "KB-001 VPN com erro 809" });
    expect(result.trace.usage).toMatchObject({ inputTokens: 300, cacheReadTokens: 240 });
    expect(tickets.calls).not.toContain("createTicket");
    expect(() => DecisionTrace.parse(result.trace)).not.toThrow();
  });
});

describe("consulta de chamado (história 2)", () => {
  it("mostra os chamados para seleção e informa o prazo calculado pelo código", async () => {
    const { result, calls } = await turn(
      [
        [toolUse("list_my_tickets", { only_open: true })],
        [decision({ intent: "consultar_chamado", show_ticket_ids: ["INC-20311", "INC-20298"], ticket_selection_prompt: "Sobre qual deles?" })],
        [text("Você tem 2 chamados abertos. Sobre qual deles quer saber?")],
      ],
      "como está meu chamado?",
    );

    const toolResult = JSON.stringify(calls[1]!.prompt.at(-1));
    expect(toolResult).toContain("VENCIDO desde");
    expect(toolResult).not.toContain("INC-20320"); // chamado da Carla
    expect(result.blocks[0]).toMatchObject({ kind: "ticket_selection", prompt: "Sobre qual deles?" });
  });

  it("não mostra cartão de chamado que o agent não consultou", async () => {
    const { result } = await turn(
      [[decision({ show_ticket_ids: ["INC-20320"] })], [text("ok")]],
      "e o INC-20320?",
    );
    expect(result.blocks.find((b) => b.kind === "ticket_cards")).toBeUndefined();
  });
});

describe("privacidade", () => {
  it("chamado de outro funcionário não é entregue ao modelo", async () => {
    const { calls } = await turn(
      [[toolUse("get_ticket", { ticket_id: "INC-20320" })], [decision()], [text("Não encontrei esse chamado.")]],
      "me fala do INC-20320",
    );
    expect(JSON.stringify(calls[1]!.prompt.at(-1))).toContain("não está entre os chamados deste funcionário");
  });

  it("nenhuma ferramenta aceita id de funcionário vindo do modelo", async () => {
    const { calls } = await turn([[decision()], [text("oi")]], "oi");
    for (const tool of calls[0]!.tools ?? []) {
      expect(JSON.stringify(tool)).not.toMatch(/employee|requester|funcionario_id/i);
    }
  });
});

const newTicketArgs = {
  type: "INC",
  title: "VPN com erro 809 no Windows 11",
  description: "Desde 20/10 o notebook com Windows 11 não conecta na VPN, erro 809. Reunião às 14h.",
  category: "rede_vpn",
  priority: "alta",
  affected: "so_eu",
  priority_reason: "Impede de trabalhar e há reunião hoje.",
  not_duplicate_reason: null,
};

describe("abrir chamado conversando (história 4)", () => {
  it("mostra rascunho e só cria depois da confirmação em outra mensagem", async () => {
    const tickets = fakeTickets(now);
    const first = await turn(
      [
        [toolUse("propose_new_ticket", newTicketArgs)],
        [decision({ intent: "abrir_chamado" })],
        [text("Confere o rascunho?")],
      ],
      "Preciso de ajuda com a VPN, erro 809 no Windows 11",
      { tickets },
    );
    expect(first.result.blocks.find((b) => b.kind === "draft")).toMatchObject({
      draft: { priority: "alta", category: "rede_vpn" },
      // alta às 15h de quarta: 3 h úteis hoje + 1 h amanhã
      dueAtPreview: new Date("2026-11-05T09:00:00-03:00").toISOString(),
    });
    expect(first.result.blocks.at(-1)).toEqual({ kind: "quick_replies", options: ["Confirmar", "Quero ajustar", "Cancelar"] });
    expect(first.result.trace.outcome).toBe("propos_rascunho");
    expect(tickets.calls).not.toContain("createTicket");
    const actionId = first.result.state.pendingAction!.id;

    const second = await turn(
      [
        (req) => {
          expect(JSON.stringify(req.prompt.at(-1))).toContain(`Proposta pendente de confirmação: ${actionId}`);
          return [toolUse("confirm_pending_action", { action_id: actionId })];
        },
        [decision({ intent: "confirmar_rascunho" })],
        [text("Pronto, abri o INC-20600.")],
      ],
      "Confirmar",
      { tickets, state: first.result.state },
    );
    expect(tickets.created()).toHaveLength(1);
    expect(second.result.trace.outcome).toBe("criou_chamado");
    expect(second.result.state.pendingAction).toBeNull();
    expect(second.result.blocks.find((b) => b.kind === "ticket_cards")).toBeTruthy();
  });

  it("recusa criar no mesmo turno em que o rascunho foi mostrado", async () => {
    const tickets = fakeTickets(now);
    const { result } = await turn(
      [
        [toolUse("propose_new_ticket", newTicketArgs)],
        (req) => {
          const pending = JSON.stringify(req.prompt.at(-1)).match(/proposta (id-\d+)/)![1];
          return [toolUse("confirm_pending_action", { action_id: pending })];
        },
        [decision({ intent: "abrir_chamado" })],
        [text("Confere?")],
      ],
      "abre um chamado da VPN",
      { tickets },
    );
    expect(tickets.calls).not.toContain("createTicket");
    expect(result.state.pendingAction).not.toBeNull();
  });

  it("não cria sem proposta pendente", async () => {
    const tickets = fakeTickets(now);
    await turn(
      [[toolUse("confirm_pending_action", { action_id: "inventado" })], [decision()], [text("ok")]],
      "pode criar",
      { tickets },
    );
    expect(tickets.calls).not.toContain("createTicket");
  });
});

describe("sem duplicidade", () => {
  it("bloqueia rascunho novo quando há chamado aberto da mesma categoria, até o agent justificar", async () => {
    const draft = { ...newTicketArgs, category: "hardware", title: "Notebook muito lento", type: "INC" };
    const { result, calls } = await turn(
      [
        [toolUse("propose_new_ticket", draft)],
        [toolUse("propose_new_ticket", { ...draft, not_duplicate_reason: "É o monitor, não o notebook do INC-20311." })],
        [decision({ intent: "abrir_chamado" })],
        [text("Confere?")],
      ],
      "meu monitor parou",
    );
    expect(JSON.stringify(calls[1]!.prompt.at(-1))).toContain("INC-20311");
    expect(result.trace.alternativesDiscarded.join(" ")).toContain("É o monitor");
    expect(result.blocks.filter((b) => b.kind === "draft")).toHaveLength(1);
  });

  it("complementar chamado existente exige confirmação (história 3)", async () => {
    const tickets = fakeTickets(now);
    const first = await turn(
      [
        [toolUse("propose_ticket_update", { ticket_id: "INC-20311", comment: "Agora o Excel fecha sozinho.", new_priority: null, priority_reason: null, reopen: false })],
        [decision({ intent: "complementar_chamado" })],
        [text("Posso adicionar isso ao INC-20311?")],
      ],
      "o notebook agora fecha o Excel sozinho",
      { tickets },
    );
    expect(first.result.blocks.find((b) => b.kind === "update_draft")).toMatchObject({ ticket: { id: "INC-20311" }, reopen: false });
    expect(tickets.calls).not.toContain("addComment");

    const id = first.result.state.pendingAction!.id;
    const second = await turn(
      [[toolUse("confirm_pending_action", { action_id: id })], [decision({ intent: "confirmar_rascunho" })], [text("Feito.")]],
      "sim",
      { tickets, state: first.result.state },
    );
    expect(second.result.trace.outcome).toBe("atualizou_chamado");
  });

  it("não propõe reabrir chamado resolvido fora da janela de 7 dias", async () => {
    const tickets = fakeTickets(now);
    tickets.tickets.find((t) => t.id === "INC-20150")!.resolvedAt = new Date(now.getTime() - 9 * 86_400_000).toISOString();
    const { result } = await turn(
      [
        [toolUse("propose_ticket_update", { ticket_id: "INC-20150", comment: "Bloqueou de novo", new_priority: null, priority_reason: null, reopen: true })],
        [decision()],
        [text("Vou abrir um novo.")],
      ],
      "a senha do SAP bloqueou de novo",
      { tickets },
    );
    expect(result.state.pendingAction).toBeNull();
  });
});

describe("encaminhamento ao analista (história 5)", () => {
  it("transfere a pedido com resumo e chamado relacionado", async () => {
    const { result, tickets } = await turn(
      [
        [toolUse("transfer_to_analyst", { reason: "pedido_do_funcionario", summary: "INC-20311 vencido há 2 dias; funcionária pediu analista.", ticket_id: "INC-20311" })],
        [decision({ intent: "falar_com_analista" })],
        [text("Chamei um analista.")],
      ],
      "o INC-20311 está parado, quero falar com um analista",
    );
    expect(result.transfer).toEqual({ reason: "pedido_do_funcionario", summary: "INC-20311 vencido há 2 dias; funcionária pediu analista.", ticketId: "INC-20311" });
    expect(tickets.calls).toContain("transferTicket");
    expect(result.trace.outcome).toBe("transferiu");
    expect(result.blocks.at(-1)).toMatchObject({ kind: "event" });
  });

  it("pedido de analista sem chamado em foco não vincula chamado escolhido pelo modelo", async () => {
    const { result, tickets } = await turn(
      [
        [toolUse("list_my_tickets", { only_open: true })],
        [toolUse("transfer_to_analyst", { reason: "pedido_do_funcionario", summary: "Funcionária pediu para falar com um analista.", ticket_id: "INC-20311" })],
        [decision({ intent: "falar_com_analista" })],
        [text("Chamei um analista.")],
      ],
      "quero falar com um analista",
    );
    expect(result.transfer).toMatchObject({ reason: "pedido_do_funcionario", ticketId: null });
    expect(tickets.calls).not.toContain("transferTicket");
  });

  it("transfere sozinho quando a confiança é baixa", async () => {
    const { result, streamed } = await turn(
      [[decision({ intent: "abrir_chamado", confidence: 0.4, confidence_reason: "Não sei se é hardware ou software" })], [text("Hmm.")]],
      "tá tudo estranho aqui",
    );
    expect(result.transfer?.reason).toBe("baixa_confianca");
    expect(result.trace.confidence.level).toBe("baixa");
    expect(streamed.join("")).toContain("chamei um analista");
  });

  it("transfere sozinho ao criar chamado crítico", async () => {
    const tickets = fakeTickets(now);
    const critical = { ...newTicketArgs, priority: "critica", affected: "minha_equipe", category: "email" };
    const first = await turn(
      [[toolUse("propose_new_ticket", critical)], [decision({ intent: "abrir_chamado" })], [text("Confere?")]],
      "o e-mail do time todo caiu",
      { tickets },
    );
    const second = await turn(
      [[toolUse("confirm_pending_action", { action_id: first.result.state.pendingAction!.id })], [decision({ intent: "confirmar_rascunho" })], [text("Aberto.")]],
      "confirmo",
      { tickets, state: first.result.state },
    );
    expect(second.result.transfer?.reason).toBe("caso_critico");
    expect(second.result.trace.outcome).toBe("transferiu");
  });
});

describe("falhas", () => {
  it("legado fora do ar: registra o erro com as tentativas e não finge que fez", async () => {
    const tickets = fakeTickets(now, { unavailable: true });
    const { result, calls } = await turn(
      [[toolUse("list_my_tickets", { only_open: true })], [decision({ intent: "consultar_chamado" })], [text("O sistema está fora do ar.")]],
      "meus chamados",
      { tickets },
    );
    expect(result.trace.actions[0]).toMatchObject({ outcome: "erro", attempts: 4 });
    expect(JSON.stringify(calls[1]!.prompt.at(-1))).toContain("indisponível");
  });

  it("recusa do modelo vira transferência e resposta honesta", async () => {
    const { result } = await turn([{ refusal: true }], "texto qualquer");
    expect(result.trace.outcome).toBe("falhou");
    expect(result.transfer?.reason).toBe("baixa_confianca");
    expect(result.state.history.at(-1)).toMatchObject({ role: "assistant" });
  });

  it("decisão não registrada recebe registro padrão explícito", async () => {
    const { result } = await turn([[text("Oi! Como posso ajudar?")]], "oi");
    expect(result.trace.understanding).toContain("não registrou");
    expect(result.transfer).toBeNull();
  });

  it("entrada inválida de ferramenta volta como erro para o modelo corrigir", async () => {
    const { calls } = await turn(
      [[toolUse("get_ticket", { ticket_id: "20311" })], [decision()], [text("ok")]],
      "chamado 20311",
    );
    // O Mastra valida a entrada contra o schema zod e devolve o erro ao modelo, sem executar.
    expect(JSON.stringify(calls[1]!.prompt.at(-1))).toContain("Tool input validation failed");
  });
});

describe("continuidade (história 6) e cache", () => {
  it("histórico só cresce entre turnos e o resumo anterior chega ao modelo", async () => {
    const first = await turn([[decision()], [text("Oi!")]], "oi", { state: initialAgentState("Ontem: INC-20311 vencido, pediu retorno.") });
    expect(JSON.stringify(first.calls[0]!.prompt)).toContain("Ontem: INC-20311 vencido");

    const second = await turn([[decision()], [text("Claro.")]], "e agora?", { state: first.result.state });
    const prefix = second.result.state.history.slice(0, first.result.state.history.length);
    expect(prefix).toEqual(first.result.state.history);
    expect(JSON.stringify(second.calls[0]!.prompt)).toContain("Oi!");
    expect(second.result.state.carryover).toBeNull();
  });

  it("as instruções estáticas vêm primeiro e os dados do funcionário ficam fora delas", async () => {
    const { calls } = await turn([[decision()], [text("oi")]], "oi");
    const systems = calls[0]!.prompt.filter((m) => m.role === "system").map((m) => String(m.content));
    expect(systems[0]).toContain("Você é o Nexo Assist");
    expect(systems[0]).not.toContain(ana.email);
    expect(systems.some((s) => s.includes(ana.name))).toBe(true);
  });
});
