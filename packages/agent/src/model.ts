import Anthropic from "@anthropic-ai/sdk";

export type MessageParam = Anthropic.Beta.BetaMessageParam;
export type Message = Anthropic.Beta.BetaMessage;

export type ModelRequest = {
  system: Anthropic.Beta.BetaTextBlockParam[];
  tools: Anthropic.Beta.BetaTool[];
  messages: MessageParam[];
};

/** Fronteira com o LLM: o loop do agent só conhece esta interface (testes usam um modelo roteirizado). */
export interface Model {
  readonly id: string;
  complete(request: ModelRequest, onText: (delta: string) => void): Promise<Message>;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type AnthropicModelOptions = {
  client?: Anthropic;
  model?: string;
  effort?: Effort;
  maxTokens?: number;
};

/**
 * Claude via streaming. Custo por conversa:
 * - tools + system estático ficam em cache (prefixo idêntico para todo funcionário e turno);
 * - cache automático no fim do histórico, que é só anexado (nunca reescrito);
 * - `effort` baixo por padrão: atendimento é conversa curta, não raciocínio longo.
 * Recusa de segurança é tratada no servidor com `fallbacks: "default"`.
 */
export function anthropicModel(options: AnthropicModelOptions = {}): Model {
  const client = options.client ?? new Anthropic();
  const model = options.model ?? "claude-opus-5-5";
  const effort = options.effort ?? "low";
  const maxTokens = options.maxTokens ?? 16_000;

  return {
    id: model,
    async complete(request, onText) {
      const stream = client.beta.messages.stream({
        model,
        max_tokens: maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort },
        cache_control: { type: "ephemeral" },
        system: request.system,
        tools: request.tools,
        messages: request.messages,
      });
      stream.on("text", onText);
      return stream.finalMessage();
    },
  };
}
