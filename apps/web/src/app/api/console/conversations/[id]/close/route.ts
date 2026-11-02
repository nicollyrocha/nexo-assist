import { ConsoleActionInput } from "@nexo/shared";
import { requireAnalyst } from "@/server/auth";
import { closeConversation } from "@/server/console";
import { handle, json, parseBody } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/console/conversations/:id/close, body ConsoleActionInput → ConsoleConversation; 409 conflict se a versão mudou.
 * Ação: encerra (em_atendimento → encerrada).
 */
export const POST = handle("console.close", async (req: Request, { params }: Ctx) => {
  const ctx = await requireAnalyst(req);
  const { version } = await parseBody(req, ConsoleActionInput);
  return json(await closeConversation(ctx, (await params).id, version));
});
