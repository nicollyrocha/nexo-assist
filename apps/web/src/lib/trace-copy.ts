import {
  PRIORITY_LABELS,
  isOpenStatus,
  type Confidence,
  type DecisionTrace,
  type Intent,
  type MessageBlock,
  type Outcome,
  type RuleId,
  type TraceAction,
  type TransferReason,
} from "@nexo/shared";

// Textos da transparência (docs/design/decision-trace.md §1 e §5). Tudo derivado do DecisionTrace e
// dos blocos da mensagem — nunca do texto livre da resposta.

export type ChipState = "ok" | "sem_resultado" | "erro" | "pending";
export type Chip = { key: string; text: string; state: ChipState; attempts: number };

const TICKET_ID = /\b(?:INC|REQ)-\d+\b/g;

export function ticketIdsIn(text: string): string[] {
  return text.match(TICKET_ID) ?? [];
}

const firstTicketId = (...texts: string[]) => {
  for (const t of texts) {
    const found = ticketIdsIn(t)[0];
    if (found) return found;
  }
  return null;
};

/** Id do chamado afetado pelo turno: cartão mostrado ou resultado da confirmação. */
export function turnTicketId(trace: DecisionTrace | null, blocks: MessageBlock[]): string | null {
  const confirm = trace?.actions.find((a) => a.tool === "confirm_pending_action" && a.outcome === "ok");
  if (confirm) {
    const id = firstTicketId(confirm.resultSummary, confirm.inputSummary);
    if (id) return id;
  }
  for (const b of blocks) {
    if (b.kind === "ticket_cards" && b.tickets[0]) return b.tickets[0].id;
  }
  return null;
}

/** Texto do chip por ferramenta e resultado (tabela "Texto do chip por ferramenta"). */
export function chipText(action: TraceAction, outcome?: Outcome, blocks: MessageBlock[] = []): string {
  const id = firstTicketId(action.inputSummary, action.resultSummary);
  const theTicket = id ? `o ${id}` : "o chamado";
  switch (action.tool) {
    case "search_help_center":
      if (action.outcome === "erro") return "não conseguiu buscar na central de ajuda";
      return action.outcome === "sem_resultado" ? "buscou na central de ajuda · nada encontrado" : "buscou na central de ajuda";
    case "list_my_tickets":
      if (action.outcome === "erro") return "não conseguiu consultar seus chamados";
      return action.outcome === "sem_resultado" ? "consultou seus chamados · nenhum encontrado" : "consultou seus chamados";
    case "get_ticket":
      if (action.outcome === "erro") return `não conseguiu consultar ${theTicket}`;
      return action.outcome === "sem_resultado" ? `não encontrou ${theTicket} entre os seus chamados` : `consultou ${theTicket}`;
    case "propose_new_ticket":
      if (action.outcome === "erro") return "não conseguiu montar o rascunho";
      return action.outcome === "sem_resultado" ? "encontrou chamados parecidos" : "montou o rascunho do chamado";
    case "propose_ticket_update": {
      if (action.outcome === "erro") return "não conseguiu montar a atualização";
      const updateId = id ?? blocks.find((b) => b.kind === "update_draft")?.ticket.id ?? null;
      return updateId ? `montou a atualização do ${updateId}` : "montou a atualização do chamado";
    }
    case "confirm_pending_action": {
      if (action.outcome === "erro") return "não conseguiu registrar no sistema de chamados";
      const done = id ?? turnTicketId(null, blocks);
      if (outcome === "criou_chamado") return done ? `criou o chamado ${done}` : "criou o chamado";
      if (outcome === "atualizou_chamado") return done ? `atualizou o ${done}` : "atualizou o chamado";
      if (outcome === "reabriu_chamado") return done ? `reabriu o ${done}` : "reabriu o chamado";
      return action.label;
    }
    case "transfer_to_analyst":
      return action.outcome === "erro" ? "não conseguiu chamar um analista" : "chamou um analista";
    default:
      return action.label;
  }
}

const derived = (key: string, text: string): Chip => ({ key, text, state: "ok", attempts: 1 });

/**
 * Chips de ação = ações do trace na ordem + chips derivados dos blocos/resultado
 * (decision-trace.md §1 "Ordem e chips derivados").
 */
export function buildChips(actions: TraceAction[], blocks: MessageBlock[], outcome?: Outcome): Chip[] {
  const chips: Chip[] = [];
  const draft = blocks.find((b) => b.kind === "draft");
  const update = blocks.find((b) => b.kind === "update_draft");
  const cards = blocks.find((b) => b.kind === "ticket_cards");
  const cardsHaveDeadline = !!cards?.tickets.some((t) => isOpenStatus(t.status) && t.dueAt);
  const lastLookup = actions.findLastIndex((a) => a.tool === "get_ticket" || a.tool === "list_my_tickets");
  let draftChipsAdded = false;

  actions.forEach((action, i) => {
    if (action.tool === "propose_new_ticket" && draft && !draftChipsAdded) {
      chips.push(derived(`d-prio-${i}`, `classificou a prioridade como ${PRIORITY_LABELS[draft.draft.priority]}`));
      chips.push(derived(`d-prazo-${i}`, "calculou o prazo"));
      draftChipsAdded = true;
    }
    if (action.tool === "propose_ticket_update" && update?.newPriority) {
      chips.push(derived(`d-reprio-${i}`, `reclassificou a prioridade como ${PRIORITY_LABELS[update.newPriority]}`));
    }
    chips.push({
      key: `a-${i}`,
      text: chipText(action, outcome, blocks),
      state: action.outcome,
      attempts: action.attempts ?? 1,
    });
    if (i === lastLookup && cardsHaveDeadline) chips.push(derived(`d-sla-${i}`, "calculou o prazo"));
  });

  if (draft && !draftChipsAdded) {
    chips.push(derived("d-prio", `classificou a prioridade como ${PRIORITY_LABELS[draft.draft.priority]}`));
    chips.push(derived("d-prazo", "calculou o prazo"));
  }
  if (outcome === "redirecionou") chips.push(derived("d-escopo", "viu que o assunto não é de TI"));
  return chips;
}

/** Resumo humano do resultado de uma ação (só no chat; nunca o resultSummary cru). */
export function humanResult(action: TraceAction): string {
  if (action.outcome === "erro") {
    return action.attempts > 1
      ? `o sistema de chamados não respondeu (${action.attempts} tentativas)`
      : "o sistema de chamados não respondeu";
  }
  const none = action.outcome === "sem_resultado";
  switch (action.tool) {
    case "search_help_center":
      return none ? "não há artigo sobre isso" : "encontrei artigos sobre isso";
    case "list_my_tickets": {
      if (none) return "você não tem chamados nesse filtro";
      const n = new Set(ticketIdsIn(action.resultSummary)).size;
      if (n === 0) return "encontrei seus chamados";
      return n === 1 ? "encontrei 1 chamado seu" : `encontrei ${n} chamados seus`;
    }
    case "get_ticket":
      return none
        ? "esse chamado não está entre os seus (por privacidade, só mostro chamados que você abriu)"
        : "vi o status e o prazo";
    case "propose_new_ticket":
      return none ? "você já tem chamados parecidos; conferi antes de abrir outro" : "rascunho pronto, esperando sua confirmação";
    case "propose_ticket_update":
      return none ? "" : "proposta pronta, esperando sua confirmação";
    case "confirm_pending_action":
      return none ? "" : "registrado no sistema de chamados";
    case "transfer_to_analyst":
      return "o caso foi para a fila dos analistas, com um resumo";
    default:
      return "";
  }
}

export type Audience = "employee" | "analyst";

const OUTCOME_COPY: Record<Outcome, { employee: string; analyst: string }> = {
  respondeu: { employee: "Respondi sua dúvida, sem abrir chamado.", analyst: "Respondeu sem abrir chamado." },
  pediu_informacao: { employee: "Pedi mais uma informação para seguir.", analyst: "Pediu mais informação." },
  propos_rascunho: {
    employee: "Montei um rascunho para você conferir. Nada foi criado ainda.",
    analyst: "Propôs rascunho — aguardando confirmação do funcionário.",
  },
  criou_chamado: { employee: "Criei o chamado {id}.", analyst: "Criou o chamado {id}." },
  atualizou_chamado: { employee: "Acrescentei a informação ao {id}.", analyst: "Atualizou o {id}." },
  reabriu_chamado: { employee: "Reabri o {id}.", analyst: "Reabriu o {id}." },
  transferiu: {
    employee: "Chamei um analista. Ele continua a conversa por aqui.",
    analyst: "Transferiu para um analista.",
  },
  redirecionou: {
    employee: "Indiquei o caminho certo: esse assunto não é de TI.",
    analyst: "Redirecionou: assunto fora de TI.",
  },
  falhou: {
    employee: "Não consegui concluir. Nada foi criado nem alterado.",
    analyst: "Falhou — nada foi registrado no sistema de chamados.",
  },
};

export function outcomeText(outcome: Outcome, audience: Audience, ticketId: string | null): string {
  return OUTCOME_COPY[outcome][audience].replace("{id}", ticketId ?? "chamado");
}

export const INTENT_LABELS: Record<Intent, string> = {
  duvida: "Tirar uma dúvida",
  consultar_chamado: "Ver como está um chamado",
  complementar_chamado: "Complementar um chamado",
  abrir_chamado: "Abrir um chamado",
  confirmar_rascunho: "Confirmar o rascunho",
  falar_com_analista: "Falar com um analista",
  fora_de_escopo: "Assunto fora de TI",
  conversa: "Conversa (cumprimento ou agradecimento)",
};

export const CONFIDENCE_LABELS: Record<Confidence["level"], string> = { alta: "Alta", media: "Média", baixa: "Baixa" };

export const CONFIDENCE_COPY: Record<Confidence["level"], { employee: string; analyst: string }> = {
  alta: { employee: "Alta — estou seguro do que fiz.", analyst: "Alta" },
  media: { employee: "Média — vale conferir os detalhes.", analyst: "Média" },
  baixa: { employee: "Baixa — por isso chamei um analista.", analyst: "Baixa — transferência automática" },
};

export const RULE_LABELS: Record<RuleId, string> = {
  tipo: "Tipo do chamado",
  categoria: "Categoria",
  abertura: "Abertura com confirmação",
  duplicidade: "Sem duplicidade",
  reabertura: "Reabertura",
  transferencia: "Transferência para analista",
  privacidade: "Privacidade",
  escopo: "Só assuntos de TI",
  prioridade: "Prioridade e prazo",
};

export const RULE_SOURCE: Record<RuleId, string> = {
  tipo: "Incidente: algo parou ou não funciona. Requisição: pedido de acesso, equipamento ou software.",
  categoria: "Acesso, Rede e VPN, Hardware, Software, E-mail ou Outros.",
  abertura:
    "Todo chamado tem título, descrição, tipo, categoria, prioridade e quem é afetado, e só é criado ou atualizado depois da confirmação do funcionário.",
  duplicidade: "Se já existe chamado aberto sobre o mesmo problema, ele é atualizado, não duplicado.",
  reabertura: "Chamados resolvidos há até 7 dias podem ser reabertos.",
  transferencia:
    "Quando o funcionário pede, o caso é crítico, o chamado está vencido ou o agent não tem segurança. Vai com resumo; o agent não responde enquanto o analista atende.",
  privacidade: "Informações de um chamado só são passadas a quem o abriu.",
  escopo: "RH, financeiro e facilities são redirecionados, sem abrir chamado.",
  prioridade:
    "Impacto (quantos são afetados) + urgência (compromisso em risco). Crítica 1 h · Alta 4 h úteis · Média 3 dias úteis · Baixa 5 dias úteis. Prazo vale para a primeira resposta e para cada atualização.",
};

export const TRANSFER_REASON_LABELS: Record<TransferReason, string> = {
  pedido_do_funcionario: "O funcionário pediu para falar com um analista",
  caso_critico: "Caso crítico (prioridade Crítica)",
  chamado_vencido: "Chamado com prazo vencido",
  baixa_confianca: "O agent não teve segurança para seguir",
};

/** Trecho curto do motivo na tag da lista do console. */
export const TRANSFER_REASON_SHORT: Record<TransferReason, string> = {
  pedido_do_funcionario: "pediu um analista",
  caso_critico: "caso crítico",
  chamado_vencido: "chamado vencido",
  baixa_confianca: "confiança baixa",
};

export const SECTION_TITLES: Record<Audience, Record<"understood" | "did" | "confidence" | "why" | "discarded" | "tech", string>> = {
  employee: {
    understood: "O que entendi",
    did: "O que fiz",
    confidence: "Segurança",
    why: "Por quê",
    discarded: "O que considerei e não fiz",
    tech: "",
  },
  analyst: {
    understood: "O que o agent entendeu",
    did: "O que o agent fez",
    confidence: "Segurança",
    why: "Por quê",
    discarded: "O que considerou e não fez",
    tech: "Detalhes técnicos",
  },
};
