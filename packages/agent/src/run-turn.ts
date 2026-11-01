import type Anthropic from "@anthropic-ai/sdk";
import {
  DecisionTrace,
  LOW_CONFIDENCE_THRESHOLD,
  PRIORITY_LABELS,
  REOPEN_WINDOW_DAYS,
  computeDueAt,
  confidenceLevel,
  isOpenStatus,
  type Employee,
  type MessageBlock,
  type Outcome,
  type Priority,
  type Ticket,
  type TicketDraft,
  type TraceAction,
  type TransferReason,
} from "@nexo/shared";
import type { CallResult, TicketsClient } from "@nexo/tickets-client";
import { articleForModel, formatNow, ticketDetailForModel, ticketForModel } from "./format";
import type { Message, MessageParam, Model } from "./model";
import { SYSTEM_PROMPT } from "./prompt";
import { ACTION_LABELS, TOOL_DEFINITIONS, ToolInputs, type ToolInput, type ToolName } from "./tools";

// Um turno do agent: a mensagem do funcionário entra, sai a resposta (em streaming), os blocos
// de interface e o DecisionTrace. As regras que não podem depender do modelo ficam aqui, em código:
// confirmação antes de criar/atualizar, trava de duplicidade, transferência por baixa confiança
// ou caso crítico, e honestidade quando o legado falha.

export type PendingAction =
  | { id: string; kind: "create"; draft: TicketDraft; proposedTurn: number }
  | {
      id: string;
      kind: "update";
      ticketId: string;
      comment: string;
      newPriority: Priority | null;
      priorityReason: string | null;
      reopen: boolean;
      proposedTurn: number;
    };

export type AgentState = {
  /** Histórico no formato da API. Só cresce (nunca é reescrito), o que mantém o cache válido. */
  history: MessageParam[];
  turn: number;
  pendingAction: PendingAction | null;
  /** Resumo de uma conversa anterior, entregue ao modelo no próximo turno (história 6). */
  carryover: string | null;
};

export const initialAgentState = (carryover: string | null = null): AgentState => ({
  history: [],
  turn: 0,
  pendingAction: null,
  carryover,
});

export type Transfer = { reason: TransferReason; summary: string; ticketId: string | null };

export type TurnInput = {
  model: Model;
  tickets: TicketsClient;
  /** Funcionário da sessão autenticada — a única identidade que o agent usa. */
  employee: Employee;
  conversationId: string;
  state: AgentState;
  userMessage: string;
  now?: Date;
  onText?: (delta: string) => void;
  onAction?: (action: TraceAction) => void;
  maxIterations?: number;
  newId?: () => string;
};

export type TurnResult = {
  reply: string;
  blocks: MessageBlock[];
  trace: DecisionTrace;
  state: AgentState;
  transfer: Transfer | null;
};

type Decision = ToolInput<"register_decision">;
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;

const FALLBACK_REPLY =
  "Não consegui concluir o atendimento por aqui. Já chamei um analista do service desk, que vai continuar com você a partir do resumo desta conversa.";
const LOW_CONFIDENCE_NOTE =
  "\n\nComo não tenho segurança sobre o melhor caminho, chamei um analista para assumir. Ele recebe o resumo desta conversa, então você não vai precisar repetir tudo.";
const CRITICAL_NOTE =
  "\n\nComo é um caso crítico, já chamei um analista do Suporte N2 para acompanhar agora.";

export async function runTurn(input: TurnInput): Promise<TurnResult> {
  const now = input.now ?? new Date();
  const newId = input.newId ?? (() => crypto.randomUUID());
  const maxIterations = input.maxIterations ?? 8;
  const turn = input.state.turn + 1;
  const started = Date.now();

  let pendingAction = input.state.pendingAction;
  let decision: Decision | null = null;
  let transfer: Transfer | null = null;
  let createdCritical: Ticket | null = null;
  let reply = "";

  const actions: TraceAction[] = [];
  const blocks: MessageBlock[] = [];
  const resultCards: Ticket[] = [];
  const alternatives: string[] = [];
  const seenTickets = new Map<string, Ticket>();
  const outcomes = new Set<Outcome>();
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

  const emitText = (delta: string) => {
    reply += delta;
    input.onText?.(delta);
  };

  const record = (
    tool: Exclude<ToolName, "register_decision">,
    inputSummary: string,
    outcome: TraceAction["outcome"],
    resultSummary: string,
    timing: { durationMs: number; attempts: number },
  ) => {
    const action: TraceAction = { tool, label: ACTION_LABELS[tool], inputSummary, outcome, resultSummary, ...timing };
    actions.push(action);
    input.onAction?.(action);
  };

  const remember = (tickets: Ticket[]) => tickets.forEach((t) => seenTickets.set(t.id, t));

  /** Erro do serviço de chamados vira texto honesto para o modelo, nunca exceção. */
  const failure = (r: Extract<CallResult<unknown>, { ok: false }>) =>
    r.error.kind === "unavailable"
      ? `O sistema de chamados está indisponível agora (${r.attempts} tentativas). Diga isso ao funcionário com honestidade e sugira tentar de novo em instantes. Não afirme que algo foi feito.`
      : `Erro do sistema de chamados: ${r.error.message}`;

  async function execute(name: ToolName, raw: unknown): Promise<{ content: string; isError?: boolean }> {
    const parsed = ToolInputs[name].safeParse(raw);
    if (!parsed.success) return { content: `Entrada inválida para ${name}: ${parsed.error.message}`, isError: true };
    const args = parsed.data as never;
    const t0 = Date.now();
    const local = () => ({ durationMs: Date.now() - t0, attempts: 1 });

    switch (name) {
      case "register_decision": {
        decision = args as Decision;
        return { content: "Decisão registrada. Agora escreva a resposta ao funcionário." };
      }

      case "search_help_center": {
        const { query } = args as ToolInput<"search_help_center">;
        const r = await input.tickets.searchHelp(query, 3);
        if (!r.ok) {
          record("search_help_center", query, "erro", r.error.message, r);
          return { content: failure(r), isError: true };
        }
        record("search_help_center", query, r.data.length ? "ok" : "sem_resultado",
          r.data.length ? r.data.map((a) => `${a.id} ${a.title}`).join("; ") : "nenhum artigo encontrado", r);
        return {
          content: r.data.length
            ? JSON.stringify(r.data.map(articleForModel))
            : "Nenhum artigo encontrado para essa busca.",
        };
      }

      case "list_my_tickets": {
        const { only_open } = args as ToolInput<"list_my_tickets">;
        const r = await input.tickets.listTickets(input.employee.id, { openOnly: only_open });
        if (!r.ok) {
          record("list_my_tickets", only_open ? "abertos" : "todos", "erro", r.error.message, r);
          return { content: failure(r), isError: true };
        }
        remember(r.data);
        record("list_my_tickets", only_open ? "abertos" : "todos", r.data.length ? "ok" : "sem_resultado",
          r.data.length ? r.data.map((t) => t.id).join(", ") : "nenhum chamado", r);
        return {
          content: r.data.length
            ? JSON.stringify(r.data.map((t) => ticketForModel(t, now)))
            : "O funcionário não tem chamados nesse filtro.",
        };
      }

      case "get_ticket": {
        const { ticket_id } = args as ToolInput<"get_ticket">;
        const r = await input.tickets.getTicket(input.employee.id, ticket_id);
        if (!r.ok) {
          record("get_ticket", ticket_id, "erro", r.error.message, r);
          return { content: failure(r), isError: true };
        }
        if (!r.data) {
          record("get_ticket", ticket_id, "sem_resultado", "não pertence ao funcionário ou não existe", r);
          return { content: `O chamado ${ticket_id} não está entre os chamados deste funcionário.` };
        }
        remember([r.data]);
        record("get_ticket", ticket_id, "ok", `${r.data.status}, prioridade ${r.data.priority}`, r);
        return { content: JSON.stringify(ticketDetailForModel(r.data, now)) };
      }

      case "propose_new_ticket": {
        const a = args as ToolInput<"propose_new_ticket">;
        const draft: TicketDraft = {
          type: a.type,
          title: a.title,
          description: a.description,
          category: a.category,
          priority: a.priority,
          affected: a.affected,
          priorityReason: a.priority_reason,
        };
        const summary = `${a.type} · ${a.category} · ${PRIORITY_LABELS[a.priority]} · “${a.title}”`;

        // Trava de duplicidade (Anexo A): chamados abertos ou reabríveis da mesma categoria.
        const all = await input.tickets.listTickets(input.employee.id);
        if (!all.ok) {
          record("propose_new_ticket", summary, "erro", "não foi possível checar duplicidade", all);
          return { content: failure(all), isError: true };
        }
        remember(all.data);
        const similar = all.data.filter((t) => t.category === a.category && reopenableOrOpen(t, now));
        if (similar.length && !a.not_duplicate_reason) {
          record("propose_new_ticket", summary, "sem_resultado",
            `parecidos encontrados: ${similar.map((t) => t.id).join(", ")}`, all);
          return {
            isError: true,
            content: `Antes de abrir, veja os chamados parecidos deste funcionário: ${JSON.stringify(similar.map((t) => ticketForModel(t, now)))}. Se algum trata do mesmo problema, não abra outro: use propose_ticket_update (complementar, ou reabrir se resolvido há até ${REOPEN_WINDOW_DAYS} dias). Se for outro problema, chame propose_new_ticket de novo explicando em not_duplicate_reason.`,
          };
        }
        if (a.not_duplicate_reason) {
          alternatives.push(`Não complementei ${similar.map((t) => t.id).join(", ") || "outro chamado"}: ${a.not_duplicate_reason}`);
        }

        pendingAction = { id: newId(), kind: "create", draft, proposedTurn: turn };
        const dueAtPreview = computeDueAt(draft.priority, now).toISOString();
        blocks.push({ kind: "draft", actionId: pendingAction.id, draft, dueAtPreview });
        outcomes.add("propos_rascunho");
        record("propose_new_ticket", summary, "ok", `rascunho ${pendingAction.id} aguardando confirmação`, local());
        return {
          content: `Rascunho mostrado ao funcionário (proposta ${pendingAction.id}), com prazo de resposta calculado. Peça para ele conferir e confirmar; nada foi criado ainda.`,
        };
      }

      case "propose_ticket_update": {
        const a = args as ToolInput<"propose_ticket_update">;
        const r = await input.tickets.getTicket(input.employee.id, a.ticket_id);
        if (!r.ok) {
          record("propose_ticket_update", a.ticket_id, "erro", r.error.message, r);
          return { content: failure(r), isError: true };
        }
        if (!r.data) {
          record("propose_ticket_update", a.ticket_id, "sem_resultado", "chamado não é do funcionário", r);
          return { content: `O chamado ${a.ticket_id} não está entre os chamados deste funcionário.`, isError: true };
        }
        const ticket = r.data;
        remember([ticket]);
        if (a.reopen && !reopenableOrOpen(ticket, now)) {
          record("propose_ticket_update", a.ticket_id, "sem_resultado", "fora da janela de reabertura", r);
          return {
            content: `${ticket.id} foi resolvido há mais de ${REOPEN_WINDOW_DAYS} dias e não pode ser reaberto. Proponha um chamado novo citando ${ticket.id} na descrição.`,
            isError: true,
          };
        }
        if (!a.reopen && !isOpenStatus(ticket.status)) {
          return {
            content: `${ticket.id} está ${ticket.status}. Para complementar, ele precisa ser reaberto (reopen: true), se estiver dentro de ${REOPEN_WINDOW_DAYS} dias.`,
            isError: true,
          };
        }
        pendingAction = {
          id: newId(),
          kind: "update",
          ticketId: ticket.id,
          comment: a.comment,
          newPriority: a.new_priority && a.new_priority !== ticket.priority ? a.new_priority : null,
          priorityReason: a.priority_reason,
          reopen: a.reopen,
          proposedTurn: turn,
        };
        blocks.push({
          kind: "update_draft",
          actionId: pendingAction.id,
          ticket,
          comment: a.comment,
          newPriority: pendingAction.newPriority,
          reopen: a.reopen,
        });
        outcomes.add("propos_rascunho");
        record("propose_ticket_update", `${ticket.id}${a.reopen ? " (reabrir)" : ""}`, "ok",
          `proposta ${pendingAction.id} aguardando confirmação`, r);
        return {
          content: `Proposta mostrada ao funcionário (proposta ${pendingAction.id}). Peça para ele conferir e confirmar; nada foi alterado ainda.`,
        };
      }

      case "confirm_pending_action": {
        const { action_id } = args as ToolInput<"confirm_pending_action">;
        const pending: PendingAction | null = pendingAction;
        if (!pending || pending.id !== action_id) {
          return { content: "Não há proposta pendente com esse id. Mostre um rascunho antes de criar ou atualizar.", isError: true };
        }
        if (pending.proposedTurn >= turn) {
          return {
            content: "O funcionário ainda não viu o rascunho. Espere a confirmação dele em uma próxima mensagem.",
            isError: true,
          };
        }

        // A proposta é a chave de idempotência: confirmar de novo (ou o retry do cliente) não duplica.
        const opts = { idempotencyKey: pending.id };
        const r =
          pending.kind === "create"
            ? await input.tickets.createTicket(input.employee.id, pending.draft, opts)
            : pending.reopen
              ? await input.tickets.reopenTicket(input.employee.id, pending.ticketId, { reason: pending.comment }, opts)
              : await input.tickets.addComment(
                  input.employee.id,
                  pending.ticketId,
                  {
                    body: pending.comment,
                    ...(pending.newPriority && { priority: pending.newPriority }),
                    ...(pending.priorityReason && { priorityReason: pending.priorityReason }),
                  },
                  opts,
                );
        const what = pending.kind === "create" ? "criar chamado" : pending.reopen ? `reabrir ${pending.ticketId}` : `complementar ${pending.ticketId}`;
        if (!r.ok) {
          record("confirm_pending_action", what, "erro", r.error.message, r);
          return { content: failure(r), isError: true };
        }

        const ticket = r.data;
        remember([ticket]);
        resultCards.push(ticket);
        pendingAction = null;
        outcomes.add(pending.kind === "create" ? "criou_chamado" : pending.reopen ? "reabriu_chamado" : "atualizou_chamado");
        if (pending.kind === "create" && ticket.priority === "critica") createdCritical = ticket;
        record("confirm_pending_action", what, "ok", `${ticket.id} · ${ticket.status}`, r);
        return {
          content: `Feito: ${JSON.stringify(ticketForModel(ticket, now))}. Informe o código e o prazo de resposta ao funcionário.`,
        };
      }

      case "transfer_to_analyst": {
        const a = args as ToolInput<"transfer_to_analyst">;
        let note = "";
        let timing = local();
        if (a.ticket_id) {
          const r = await input.tickets.transferTicket(input.employee.id, a.ticket_id, { reason: a.reason, summary: a.summary }, { idempotencyKey: `${input.conversationId}:${turn}:transfer` });
          timing = r;
          if (r.ok) remember([r.data]);
          else note = ` O chamado ${a.ticket_id} não pôde ser marcado no sistema (${r.error.message}), mas a conversa foi transferida.`;
        }
        transfer = { reason: a.reason, summary: a.summary, ticketId: a.ticket_id };
        outcomes.add("transferiu");
        record("transfer_to_analyst", a.reason, "ok", a.ticket_id ? `com ${a.ticket_id}` : "sem chamado", timing);
        return {
          content: `Conversa transferida para um analista.${note} Avise o funcionário que um analista vai assumir e que você fica em pausa até lá.`,
        };
      }
    }
  }

  // ---- Monta a requisição -------------------------------------------------------------------

  const context = [
    `Agora: ${formatNow(now)}.`,
    input.state.carryover && `Resumo da conversa anterior com este funcionário: ${input.state.carryover}`,
    pendingAction && `Proposta pendente de confirmação: ${pendingAction.id} (${describePending(pendingAction)}).`,
  ]
    .filter(Boolean)
    .join("\n");

  const messages: MessageParam[] = [
    ...input.state.history,
    {
      role: "user",
      content: [
        { type: "text", text: `[contexto do sistema]\n${context}` },
        { type: "text", text: input.userMessage },
      ],
    },
  ];
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: `Funcionário atendido: ${input.employee.name} (${input.employee.email}), área ${input.employee.department}.`,
    },
  ];

  // ---- Loop de ferramentas ------------------------------------------------------------------

  let failed: "refusal" | "exhausted" | null = null;
  for (let i = 0; ; i++) {
    if (i >= maxIterations) {
      failed = "exhausted";
      break;
    }
    const message: Message = await input.model.complete({ system, tools: TOOL_DEFINITIONS, messages }, emitText);
    usage.inputTokens += message.usage.input_tokens;
    usage.outputTokens += message.usage.output_tokens;
    usage.cacheReadTokens += message.usage.cache_read_input_tokens ?? 0;
    usage.cacheWriteTokens += message.usage.cache_creation_input_tokens ?? 0;

    if (message.stop_reason === "refusal") {
      failed = "refusal";
      break;
    }
    messages.push({ role: "assistant", content: message.content });

    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) break;

    const results: ToolResult[] = [];
    for (const use of toolUses) {
      const { content, isError } = use.name in ToolInputs
        ? await execute(use.name as ToolName, use.input)
        : { content: `Ferramenta desconhecida: ${use.name}`, isError: true };
      results.push({ type: "tool_result", tool_use_id: use.id, content, ...(isError && { is_error: true }) });
    }
    messages.push({ role: "user", content: results });
  }

  // ---- Regras finais, em código ---------------------------------------------------------------

  const finalDecision: Decision = decision ?? {
    understanding: "O agent não registrou o entendimento neste turno.",
    intent: "conversa",
    confidence: LOW_CONFIDENCE_THRESHOLD,
    confidence_reason: "Decisão não registrada pelo agent; confiança assumida como média.",
    rationale: "Sem registro explícito do agent.",
    rules_applied: [],
    alternatives_discarded: [],
    show_ticket_ids: [],
    ticket_selection_prompt: null,
    quick_replies: [],
    asked_for_information: false,
  };

  const lastUserText = `Última mensagem do funcionário: “${input.userMessage}”.`;
  if (failed) {
    if (reply) emitText("\n\n");
    emitText(FALLBACK_REPLY);
    transfer ??= {
      reason: "baixa_confianca",
      summary: `${failed === "refusal" ? "O modelo recusou responder" : "O agent não concluiu o turno"}. ${lastUserText}`,
      ticketId: null,
    };
    outcomes.add("falhou");
  } else if (!transfer && finalDecision.confidence < LOW_CONFIDENCE_THRESHOLD && finalDecision.intent !== "conversa") {
    emitText(LOW_CONFIDENCE_NOTE);
    transfer = {
      reason: "baixa_confianca",
      summary: `${finalDecision.understanding} Dúvida do agent: ${finalDecision.confidence_reason} ${lastUserText}`,
      ticketId: finalDecision.show_ticket_ids[0] ?? null,
    };
    record("transfer_to_analyst", "baixa_confianca", "ok", "transferência automática por baixa confiança", { durationMs: 0, attempts: 1 });
  } else if (!transfer && createdCritical) {
    const critical: Ticket = createdCritical;
    emitText(CRITICAL_NOTE);
    transfer = {
      reason: "caso_critico",
      summary: `Chamado crítico ${critical.id} aberto agora: ${critical.title}. ${critical.description}`,
      ticketId: critical.id,
    };
    record("transfer_to_analyst", "caso_critico", "ok", `transferência automática com ${critical.id}`, { durationMs: 0, attempts: 1 });
  }
  if (transfer) outcomes.add("transferiu");

  // Fecha o histórico com a resposta exibida quando o modelo não chegou a produzi-la.
  if (failed) messages.push({ role: "assistant", content: [{ type: "text", text: FALLBACK_REPLY }] });

  // ---- Blocos de interface ------------------------------------------------------------------

  const shown = finalDecision.show_ticket_ids.map((id) => seenTickets.get(id)).filter((t): t is Ticket => !!t);
  const ordered: MessageBlock[] = [];
  if (shown.length > 1 && finalDecision.ticket_selection_prompt) {
    ordered.push({ kind: "ticket_selection", prompt: finalDecision.ticket_selection_prompt, tickets: shown });
  } else if (shown.length) {
    ordered.push({ kind: "ticket_cards", tickets: shown });
  }
  ordered.push(...blocks);
  const freshResults = resultCards.filter((t) => !shown.some((s) => s.id === t.id));
  if (freshResults.length) ordered.push({ kind: "ticket_cards", tickets: freshResults });
  if (transfer) ordered.push({ kind: "event", text: "Conversa transferida para um analista do service desk" });

  const proposedNow = blocks.some((b) => b.kind === "draft" || b.kind === "update_draft");
  const quickReplies = transfer
    ? []
    : finalDecision.quick_replies.length
      ? finalDecision.quick_replies
      : proposedNow
        ? ["Confirmar", "Quero ajustar", "Cancelar"]
        : [];
  if (quickReplies.length) ordered.push({ kind: "quick_replies", options: quickReplies.slice(0, 4) });

  // ---- Trace ----------------------------------------------------------------------------------

  const trace = DecisionTrace.parse({
    id: newId(),
    conversationId: input.conversationId,
    understanding: finalDecision.understanding,
    intent: finalDecision.intent,
    actions,
    outcome: pickOutcome(outcomes, finalDecision),
    confidence: {
      level: confidenceLevel(finalDecision.confidence),
      score: finalDecision.confidence,
      reason: finalDecision.confidence_reason,
    },
    rationale: finalDecision.rationale,
    rulesApplied: finalDecision.rules_applied.map((r) => ({ rule: r.rule, explanation: r.explanation })),
    alternativesDiscarded: [...finalDecision.alternatives_discarded, ...alternatives],
    usage: { model: input.model.id, ...usage, latencyMs: Date.now() - started },
    createdAt: now.toISOString(),
  });

  return {
    reply: reply.trim(),
    blocks: ordered,
    trace,
    transfer,
    state: { history: messages, turn, pendingAction, carryover: null },
  };
}

const DAY = 24 * 3_600_000;

function reopenableOrOpen(ticket: Ticket, now: Date) {
  if (isOpenStatus(ticket.status)) return true;
  return (
    ticket.status === "resolvido" &&
    !!ticket.resolvedAt &&
    now.getTime() - new Date(ticket.resolvedAt).getTime() <= REOPEN_WINDOW_DAYS * DAY
  );
}

function describePending(p: PendingAction) {
  return p.kind === "create"
    ? `criar ${p.draft.type} “${p.draft.title}”`
    : `${p.reopen ? "reabrir" : "complementar"} ${p.ticketId}`;
}

const OUTCOME_PRIORITY: Outcome[] = [
  "falhou",
  "transferiu",
  "criou_chamado",
  "reabriu_chamado",
  "atualizou_chamado",
  "propos_rascunho",
];

function pickOutcome(outcomes: Set<Outcome>, decision: Decision): Outcome {
  const strongest = OUTCOME_PRIORITY.find((o) => outcomes.has(o));
  if (strongest) return strongest;
  if (decision.intent === "fora_de_escopo") return "redirecionou";
  return decision.asked_for_information ? "pediu_informacao" : "respondeu";
}
