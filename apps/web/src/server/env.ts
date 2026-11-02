import { z } from "zod";

// Variáveis do servidor (nunca NEXT_PUBLIC_*). Validadas na primeira leitura, não no import:
// o build da Vercel importa os módulos de rota sem ter (nem precisar de) segredos.

const ServerEnv = z
  .object({
    DATABASE_URL: z.url({ error: "DATABASE_URL precisa ser a URL (pooled) do Neon do app." }),
    SESSION_SECRET: z.string().min(32, { error: "SESSION_SECRET precisa ter pelo menos 32 caracteres (rode pnpm setup:env)." }),
    TICKETS_SERVICE_URL: z.url({ error: "TICKETS_SERVICE_URL precisa ser a URL do serviço de chamados (ex.: http://localhost:3001)." }),
    TICKETS_SERVICE_KEY: z.string().min(1, { error: "TICKETS_SERVICE_KEY é obrigatória (mesma chave do apps/tickets)." }),
    AGENT_MODEL: z.string().optional(),
    AGENT_MODEL_URL: z.string().optional(),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const models = env.AGENT_MODEL?.trim() || "google/";
    if (!env.AGENT_MODEL_URL && models.split(",").some((m) => m.trim().startsWith("google/")) && !env.GOOGLE_GENERATIVE_AI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_GENERATIVE_AI_API_KEY"],
        message: "GOOGLE_GENERATIVE_AI_API_KEY é obrigatória com modelos google/* (padrão). Crie uma em aistudio.google.com.",
      });
    }
  });
export type ServerEnv = z.infer<typeof ServerEnv>;

export class EnvError extends Error {
  override name = "EnvError";
}

let cached: ServerEnv | null = null;

/** Lê e valida o ambiente uma vez. Falha com a lista do que falta (sem ecoar valores). */
export function serverEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  if (cached && source === process.env) return cached;
  const parsed = ServerEnv.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `- ${i.path.join(".") || "env"}: ${i.message}`);
    throw new EnvError(`Variáveis de ambiente inválidas em apps/web (veja .env.example):\n${lines.join("\n")}`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}
