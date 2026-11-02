import { ConsoleFilter } from "@nexo/shared";
import { requireAnalyst } from "@/server/auth";
import { listConsole } from "@/server/console";
import { ApiFailure, handle, json } from "@/server/http";

/** GET /api/console/conversations?filter=todas|para_voce|com_agent|minhas&q=texto → ConsoleList. */
export const GET = handle("console.list", async (req: Request) => {
  const ctx = await requireAnalyst(req);
  const params = new URL(req.url).searchParams;
  const filter = ConsoleFilter.safeParse(params.get("filter") ?? "todas");
  if (!filter.success) throw new ApiFailure("invalid_input", "Filtro inválido.");
  return json(await listConsole(ctx, filter.data, params.get("q")));
});
