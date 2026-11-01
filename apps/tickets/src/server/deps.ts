import { createTicketsDb } from "../db/client";
import { LegacySimulator } from "./legacy";
import type { Deps } from "./router";

let deps: Deps | undefined;

/** Dependências de produção, montadas uma vez por instância a partir das variáveis de ambiente. */
export function productionDeps(): Deps {
  if (deps) return deps;
  const url = process.env.TICKETS_DATABASE_URL;
  const serviceKey = process.env.TICKETS_SERVICE_KEY;
  if (!url || !serviceKey) throw new Error("TICKETS_DATABASE_URL e TICKETS_SERVICE_KEY são obrigatórias.");
  deps = {
    db: createTicketsDb(url),
    serviceKey,
    legacy: new LegacySimulator(
      Number(process.env.TICKETS_FAILURE_RATE ?? 0),
      Number(process.env.TICKETS_OUTAGE_MS ?? 3000),
    ),
  };
  return deps;
}
