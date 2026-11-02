import { requireAnalyst } from "@/server/auth";
import { consoleDetail } from "@/server/console";
import { handle, json } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/console/conversations/:id → ConsoleConversation. */
export const GET = handle("console.detail", async (req: Request, { params }: Ctx) => {
  const ctx = await requireAnalyst(req);
  return json(await consoleDetail(ctx, (await params).id));
});
