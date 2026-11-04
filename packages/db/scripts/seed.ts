import { createDb } from "../src/client";
import { seedApp } from "../src/seed";

// Conversas de exemplo do console. Só apaga/recria as conversas do próprio seed (ids fixos).
// Os chamados citados vêm do seed do serviço de chamados: rode `pnpm --filter @nexo/tickets db:seed` também.
const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw new Error("Defina DATABASE_URL_UNPOOLED em apps/web/.env.local");

try {
  const data = await seedApp(createDb(url));
  const waiting = data.conversations.filter((c) => c.status === "aguardando_atendente").length;
  console.log(
    `✓ seed ok: ${data.conversations.length} conversas (${waiting} aguardando atendente), ${data.messages.length} mensagens, ${data.traces.length} traces.`,
  );
} catch (error) {
  const cause = (error as { cause?: Error }).cause ?? (error as Error);
  console.error(`✗ seed falhou: ${cause.message}`);
  process.exitCode = 1;
}
