import { requireEmployee } from "@/server/auth";
import { conversationView, currentConversation } from "@/server/chat";
import { handle, json } from "@/server/http";

/** GET /api/chat → ConversationView da conversa em andamento (cria uma se não houver). */
export const GET = handle("chat.get", async (req: Request) => {
  const ctx = await requireEmployee(req);
  return json(await conversationView(ctx, await currentConversation(ctx)));
});
