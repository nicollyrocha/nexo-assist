import { SendMessageInput } from "@nexo/shared";
import { requireAnalyst } from "@/server/auth";
import { postAnalystMessage } from "@/server/console";
import { handle, json, parseBody } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/console/conversations/:id/messages, body SendMessageInput → MessageView (só em atendimento comigo). */
export const POST = handle("console.message", async (req: Request, { params }: Ctx) => {
  const ctx = await requireAnalyst(req);
  const { text } = await parseBody(req, SendMessageInput);
  return json(await postAnalystMessage(ctx, (await params).id, text));
});
