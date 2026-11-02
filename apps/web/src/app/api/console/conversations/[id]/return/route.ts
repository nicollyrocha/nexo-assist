import { ConsoleActionInput } from "@nexo/shared";
import { requireAnalyst } from "@/server/auth";
import { returnConversation } from "@/server/console";
import { handle, json, parseBody } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/console/conversations/:id/return, body ConsoleActionInput → ConsoleConversation; 409 conflict se a versão mudou.
 * Ação: devolve ao agent (em_atendimento → ativa).
 */
export const POST = handle("console.return", async (req: Request, { params }: Ctx) => {
  const ctx = await requireAnalyst(req);
  const { version } = await parseBody(req, ConsoleActionInput);
  return json(await returnConversation(ctx, (await params).id, version));
});
