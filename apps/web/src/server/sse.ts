import type { ChatStreamEvent } from "@nexo/shared";
import { logError } from "./http";

const encoder = new TextEncoder();
export const encodeEvent = (event: ChatStreamEvent) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

/**
 * Resposta SSE (text/event-stream): cada evento é `data: <json ChatStreamEvent>\n\n`.
 * O turno roda até o fim mesmo se o cliente desconectar, para a resposta e o trace ficarem gravados.
 * Exceção inesperada vira evento "error" (logada sem segredos) e fecha o stream.
 */
export function sseResponse(scope: string, run: (emit: (event: ChatStreamEvent) => void) => Promise<void>): Response {
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encodeEvent(event));
        } catch {
          open = false;
        }
      };
      try {
        await run(emit);
      } catch (error) {
        logError(scope, error);
        emit({ type: "error", error: { code: "internal", message: "Algo deu errado do nosso lado. Tente de novo em instantes." } });
      } finally {
        if (open) {
          open = false;
          try {
            controller.close();
          } catch {
            // já fechado pelo cliente
          }
        }
      }
    },
    cancel() {
      open = false;
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

/** Lê um stream SSE inteiro e devolve os eventos (usado nos testes e útil para depurar). */
export async function readEvents(res: Response): Promise<ChatStreamEvent[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice("data: ".length)) as ChatStreamEvent);
}
