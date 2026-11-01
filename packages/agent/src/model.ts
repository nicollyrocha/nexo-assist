import { Agent } from "@mastra/core/agent";
import { SYSTEM_PROMPT } from "./prompt";
import { createNexoTools } from "./tools";

export type ModelConfig = ConstructorParameters<typeof Agent>[0]["model"];

/** Padrão gratuito: Gemini Flash pelo Google AI Studio (chave em GOOGLE_GENERATIVE_AI_API_KEY). */
export const DEFAULT_MODEL = "google/gemini-2.5-flash";

/**
 * Escolhe o modelo pelo ambiente, no formato `provedor/modelo` do model router do Mastra:
 * - AGENT_MODEL=google/gemini-2.5-flash        (GOOGLE_GENERATIVE_AI_API_KEY)
 * - AGENT_MODEL=groq/openai/gpt-oss-120b       (GROQ_API_KEY)
 * - AGENT_MODEL=openrouter/<modelo>:free       (OPENROUTER_API_KEY)
 * - AGENT_MODEL=anthropic/claude-haiku-5-5     (ANTHROPIC_API_KEY)
 * - AGENT_MODEL=ollama/qwen3:8b + AGENT_MODEL_URL=http://localhost:11434/v1  (local, sem chave)
 */
export function modelFromEnv(env: NodeJS.ProcessEnv = process.env): { config: ModelConfig; id: string } {
  const id = env.AGENT_MODEL || DEFAULT_MODEL;
  const url = env.AGENT_MODEL_URL;
  return {
    id,
    config: url ? { id: id as `${string}/${string}`, url, apiKey: env.AGENT_MODEL_API_KEY ?? "local" } : id,
  };
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
