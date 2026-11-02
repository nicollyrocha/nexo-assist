import { Agent } from "@mastra/core/agent";
import { SYSTEM_PROMPT } from "./prompt";
import { createNexoTools } from "./tools";

export type ModelConfig = ConstructorParameters<typeof Agent>[0]["model"];

/**
 * Padrão gratuito: modelos Gemini do Google AI Studio (chave em GOOGLE_GENERATIVE_AI_API_KEY), em
 * cadeia de reserva. No plano gratuito a cota é por modelo (ex.: 5 req/min e 20 req/dia no 3.6-flash),
 * então, quando um estoura, a mesma chamada segue para o próximo — somando as cotas.
 */
export const DEFAULT_MODELS = [
  "google/gemini-3.6-flash",
  "google/gemini-3.5-flash",
  "google/gemini-3.5-flash-lite",
  "google/gemini-3.1-flash-lite",
];

/**
 * Escolhe o(s) modelo(s) pelo ambiente, no formato `provedor/modelo` do model router do Mastra.
 * AGENT_MODEL aceita um modelo ou uma lista separada por vírgulas (cadeia de reserva):
 * - google/gemini-3.6-flash,google/gemini-3.5-flash   (GOOGLE_GENERATIVE_AI_API_KEY)
 * - groq/openai/gpt-oss-120b                          (GROQ_API_KEY)
 * - openrouter/<modelo>:free                          (OPENROUTER_API_KEY)
 * - anthropic/claude-haiku-5-5                        (ANTHROPIC_API_KEY)
 * - ollama/qwen3:8b + AGENT_MODEL_URL=http://localhost:11434/v1  (local, sem chave)
 */
export function modelFromEnv(env: NodeJS.ProcessEnv = process.env): { config: ModelConfig; id: string } {
  const ids = (env.AGENT_MODEL || DEFAULT_MODELS.join(","))
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const url = env.AGENT_MODEL_URL;

  if (url) {
    const id = ids[0] as `${string}/${string}`;
    return { id, config: { id, url, apiKey: env.AGENT_MODEL_API_KEY ?? "local" } };
  }
  if (ids.length === 1) return { id: ids[0]!, config: ids[0]! };
  // Sem retentativa no mesmo modelo: erro de cota passa direto para o próximo da cadeia.
  return { id: ids.join(" → "), config: ids.map((id) => ({ id, model: id, maxRetries: 0 })) };
}

/** O agent do Nexo Assist no Mastra: instruções estáticas + ferramentas; o contexto do turno vai no RequestContext. */
export function createNexoAgent(model: ModelConfig) {
  return new Agent({
    id: "nexo-assist",
    name: "Nexo Assist",
    instructions: SYSTEM_PROMPT,
    model,
    tools: createNexoTools(),
  });
}

export type NexoAgent = ReturnType<typeof createNexoAgent>;
