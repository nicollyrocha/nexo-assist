import { requireEmployee } from "@/server/auth";
import { conversationView, newConversation } from "@/server/chat";
import { handle, json } from "@/server/http";

/** POST /api/chat/new → ConversationView de uma conversa nova (ou da atual, se ainda não foi encerrada). */
export const POST = handle("chat.new", async (req: Request) => {
  const ctx = await requireEmployee(req);
  return json(await conversationView(ctx, await newConversation(ctx)));
});
