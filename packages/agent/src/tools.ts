import type Anthropic from "@anthropic-ai/sdk";
import { AFFECTED, CATEGORIES, INTENTS, PRIORITIES, RULES, TICKET_TYPES, TRANSFER_REASONS } from "@nexo/shared";
import { z } from "zod";

// Ferramentas do agent. O id do funcionário nunca é parâmetro: o servidor injeta o da sessão,
// então o modelo não consegue pedir dados de outra pessoa. Toda entrada é validada com zod antes
// de executar.

const ticketId = z.string().regex(/^(INC|REQ)-\d+$/).describe("Código do chamado, ex.: INC-20311");

export const ToolInputs = {
  search_help_center: z.object({
    query: z.string().min(2).describe("Pergunta ou palavras-chave do problema, em português"),
  }),
  list_my_tickets: z.object({
    only_open: z.boolean().describe("true para só os abertos; false inclui resolvidos e fechados"),
  }),
  get_ticket: z.object({ ticket_id: ticketId }),
  propose_new_ticket: z.object({
    type: z.enum(TICKET_TYPES),
    title: z.string().min(5).max(120).describe("Título curto e específico"),
    description: z
      .string()
      .min(20)
      .describe("Descrição completa: o que acontece, desde quando, o que já foi tentado, impacto"),
    category: z.enum(CATEGORIES),
    priority: z.enum(PRIORITIES),
    affected: z.enum(AFFECTED).describe("Quem é afetado: só a pessoa, a equipe ou a empresa"),
    priority_reason: z.string().min(5).describe("Por que essa prioridade, citando impacto e urgência"),
    not_duplicate_reason: z
      .string()
      .nullable()
      .describe(
        "null na primeira tentativa. Se o sistema apontar chamados parecidos e você concluir que é outro problema, explique aqui por que não é duplicado.",
      ),
  }),
  propose_ticket_update: z.object({
    ticket_id: ticketId,
    comment: z.string().min(5).describe("O complemento, escrito para o analista entender"),
    new_priority: z.enum(PRIORITIES).nullable().describe("Nova prioridade se a informação mudar a gravidade; senão null"),
    priority_reason: z.string().nullable(),
    reopen: z.boolean().describe("true para reabrir um chamado resolvido há até 7 dias"),
  }),
  confirm_pending_action: z.object({
    action_id: z.string().describe("O id da proposta que o funcionário confirmou"),
  }),
  transfer_to_analyst: z.object({
    reason: z.enum(TRANSFER_REASONS),
    summary: z
      .string()
      .min(20)
      .describe("Resumo para o analista: problema, o que já foi tentado, chamados envolvidos, urgência"),
    ticket_id: ticketId.nullable().describe("Chamado relacionado, se houver"),
  }),
  register_decision: z.object({
    understanding: z.string().describe("O que você entendeu da mensagem, em uma frase"),
    intent: z.enum(INTENTS),
    confidence: z.number().min(0).max(1),
    confidence_reason: z.string().describe("Por que esse grau de segurança"),
    rationale: z.string().describe("Justificativa curta da decisão, para um analista ler"),
    rules_applied: z.array(z.object({ rule: z.enum(RULES), explanation: z.string() })),
    alternatives_discarded: z.array(z.string()).describe("O que você considerou e não fez, e por quê"),
    show_ticket_ids: z.array(ticketId).describe("Chamados a mostrar como cartões na resposta"),
    ticket_selection_prompt: z
      .string()
      .nullable()
      .describe("Pergunta para o funcionário escolher entre os chamados mostrados; null se não for o caso"),
    quick_replies: z.array(z.string().max(40)).max(4).describe("Até 4 respostas rápidas; [] se não couber"),
    asked_for_information: z.boolean().describe("true se a resposta pede algum dado ao funcionário"),
  }),
} as const;

export type ToolName = keyof typeof ToolInputs;
export type ToolInput<T extends ToolName> = z.infer<(typeof ToolInputs)[T]>;

const DESCRIPTIONS: Record<ToolName, string> = {
  search_help_center: "Busca artigos na central de ajuda de TI. Use antes de responder qualquer dúvida.",
  list_my_tickets: "Lista os chamados do funcionário, com status e situação do prazo (no prazo ou vencido).",
  get_ticket: "Detalha um chamado do funcionário, com o histórico de atualizações.",
  propose_new_ticket:
    "Monta o rascunho de um chamado novo e mostra ao funcionário para conferência. Não cria nada. O sistema verifica chamados parecidos e pode pedir que você justifique por que não é duplicado.",
  propose_ticket_update:
    "Monta a proposta de complementar (ou reabrir) um chamado do funcionário e mostra para conferência. Não altera nada.",
  confirm_pending_action:
    "Executa a proposta pendente (criar, complementar ou reabrir) depois que o funcionário confirmou, em mensagem posterior ao rascunho.",
  transfer_to_analyst:
    "Transfere a conversa para um analista do service desk, com resumo do caso. O agent fica pausado até o analista devolver.",
  register_decision:
    "Registra o que você entendeu, decidiu e por quê. Obrigatório uma vez por turno, antes da resposta final.",
};

function jsonSchema(schema: z.ZodType): Anthropic.Tool.InputSchema {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest as Anthropic.Tool.InputSchema;
}

export const TOOL_DEFINITIONS: Anthropic.Tool[] = (Object.keys(ToolInputs) as ToolName[]).map((name) => ({
  name,
  description: DESCRIPTIONS[name],
  input_schema: jsonSchema(ToolInputs[name]),
}));

/** Rótulo do chip de ação, no passado, como no protótipo. */
export const ACTION_LABELS: Record<Exclude<ToolName, "register_decision">, string> = {
  search_help_center: "buscou na central de ajuda",
  list_my_tickets: "consultou seus chamados",
  get_ticket: "abriu o chamado",
  propose_new_ticket: "montou o rascunho do chamado",
  propose_ticket_update: "montou a atualização do chamado",
  confirm_pending_action: "registrou no sistema de chamados",
  transfer_to_analyst: "chamou um analista",
};
