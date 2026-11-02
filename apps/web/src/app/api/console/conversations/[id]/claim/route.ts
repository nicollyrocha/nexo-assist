import { ConsoleActionInput } from "@nexo/shared";
import { requireAnalyst } from "@/server/auth";
import { claimConversation } from "@/server/console";
import { handle, json, parseBody } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/console/conversations/:id/claim, body ConsoleActionInput → ConsoleConversation; 409 conflict se a versão mudou.
 * Ação: assume (aguardando_atendente|ativa → em_atendimento comigo).
 */
export const POST = handle("console.claim", async (req: Request, { params }: Ctx) => {
  const ctx = await requireAnalyst(req);
  const { version } = await parseBody(req, ConsoleActionInput);
  return json(await claimConversation(ctx, (await params).id, version));
});
