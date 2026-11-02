import { createNexoAgent, modelFromEnv, type NexoAgent } from "@nexo/agent";
import { createDb, type Db } from "@nexo/db";
import { createTicketsClient, type TicketsClient } from "@nexo/tickets-client";
import { createDirectory, type Directory } from "./directory";
import { serverEnv } from "./env";

/** Tudo que os handlers usam de fora. Criado uma vez por instância (as funções da Vercel reaproveitam). */
export type Deps = {
  db: Db;
  tickets: TicketsClient;
  agent: NexoAgent;
  /** Identificador do(s) modelo(s) para o DecisionTrace. */
  modelId: string;
  sessionSecret: string;
  directory: Directory;
  now: () => Date;
};

let deps: Deps | null = null;

export function getDeps(): Deps {
  if (deps) return deps;
  const env = serverEnv();
  const tickets = createTicketsClient({ baseUrl: env.TICKETS_SERVICE_URL, serviceKey: env.TICKETS_SERVICE_KEY });
  const model = modelFromEnv(process.env);
  deps = {
    db: createDb(env.DATABASE_URL),
    tickets,
    agent: createNexoAgent(model.config),
    modelId: model.id,
    sessionSecret: env.SESSION_SECRET,
    directory: createDirectory(tickets),
    now: () => new Date(),
  };
  return deps;
}

/** Testes: injeta banco PGlite, serviço de chamados falso e modelo roteirizado. */
export function setDepsForTesting(next: Deps | null) {
  deps = next;
}
