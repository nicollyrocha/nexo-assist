import { SendMessageInput } from "@nexo/shared";
import { requireEmployee } from "@/server/auth";
import { sendMessage } from "@/server/chat";
import { handle, parseBody } from "@/server/http";
import { sseResponse } from "@/server/sse";

// Turno do agent: modelo (cadeia com reserva) + chamadas ao legado com retry (até ~12 s cada).
// 60 s cabe no plano Hobby da Vercel e sobra para o pior caso de um turno.
export const maxDuration = 60;

/**
 * POST /api/chat/messages, body SendMessageInput → text/event-stream de ChatStreamEvent:
 * saved → (paused) | (action | text)* → done; ou error (ex.: limit_reached).
 * Sessão e corpo inválidos respondem JSON (401/403/400) antes de abrir o stream.
 */
export const POST = handle("chat.messages", async (req: Request) => {
  const ctx = await requireEmployee(req);
  const { text } = await parseBody(req, SendMessageInput);
  return sseResponse("chat.messages", (emit) => sendMessage(ctx, text, emit));
});
