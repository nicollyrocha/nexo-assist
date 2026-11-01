import { z } from "zod";

/**
 * DecisionTrace: o registro do que o agent entendeu, fez e por quê em um turno.
 * É a fonte única da transparência — chips de ação, detalhe expansível e filtros do console
 * são todos derivados daqui, nunca do texto livre da resposta.
 */

export const INTENTS = [
  "duvida",
  "consultar_chamado",
  "complementar_chamado",
  "abrir_chamado",
  "confirmar_rascunho",
  "falar_com_analista",
  "fora_de_escopo",
  "conversa",
] as const;
export const Intent = z.enum(INTENTS);
export type Intent = z.infer<typeof Intent>;

/** Regras do Anexo A que podem fundamentar uma decisão. */
export const RULES = [
  "tipo",
  "categoria",
  "abertura",
  "duplicidade",
  "reabertura",
  "transferencia",
  "privacidade",
  "escopo",
  "prioridade",
] as const;
export const RuleId = z.enum(RULES);
export type RuleId = z.infer<typeof RuleId>;

export const TOOLS = [
  "search_help_center",
  "list_my_tickets",
  "get_ticket",
  "propose_new_ticket",
  "propose_ticket_update",
  "confirm_pending_action",
  "transfer_to_analyst",
] as const;
export const ToolName = z.enum(TOOLS);
export type ToolName = z.infer<typeof ToolName>;

export const TraceAction = z.object({
  tool: ToolName,
  /** Texto curto no passado para o chip: "consultou seus chamados". */
  label: z.string(),
  /** Entrada resumida e sem dados sensíveis. */
  inputSummary: z.string(),
  outcome: z.enum(["ok", "sem_resultado", "erro"]),
  resultSummary: z.string(),
  durationMs: z.number().int().nonnegative(),
  /** Tentativas feitas contra o serviço de chamados (legado instável). */
  attempts: z.number().int().positive().default(1),
});
export type TraceAction = z.infer<typeof TraceAction>;

export const CONFIDENCE_LEVELS = ["alta", "media", "baixa"] as const;
export const Confidence = z.object({
  level: z.enum(CONFIDENCE_LEVELS),
  score: z.number().min(0).max(1),
  reason: z.string(),
});
export type Confidence = z.infer<typeof Confidence>;

export const OUTCOMES = [
  "respondeu",
  "pediu_informacao",
  "propos_rascunho",
  "criou_chamado",
  "atualizou_chamado",
  "reabriu_chamado",
  "transferiu",
  "redirecionou",
  "falhou",
] as const;
export const Outcome = z.enum(OUTCOMES);
export type Outcome = z.infer<typeof Outcome>;

export const Usage = z.object({
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
});
export type Usage = z.infer<typeof Usage>;

export const DecisionTrace = z.object({
  id: z.string(),
  conversationId: z.string(),
  /** O que o agent entendeu da mensagem, em uma frase legível. */
  understanding: z.string(),
  intent: Intent,
  actions: z.array(TraceAction),
  outcome: Outcome,
  confidence: Confidence,
  /** Por que essa decisão, em linguagem de gente. */
  rationale: z.string(),
  rulesApplied: z.array(z.object({ rule: RuleId, explanation: z.string() })),
  /** O que o agent considerou e descartou, quando relevante (ex.: "não abri chamado novo: INC-20311 já trata disso"). */
  alternativesDiscarded: z.array(z.string()),
  usage: Usage,
  createdAt: z.iso.datetime(),
});
export type DecisionTrace = z.infer<typeof DecisionTrace>;

/** Abaixo deste score, a confiança é baixa e o caso vai para o analista (Anexo A: transferência). */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

export const confidenceLevel = (score: number): Confidence["level"] =>
  score >= 0.85 ? "alta" : score >= LOW_CONFIDENCE_THRESHOLD ? "media" : "baixa";
