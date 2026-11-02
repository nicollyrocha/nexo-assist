import { ChatStreamEvent } from "@nexo/shared";

/**
 * Parser incremental de text/event-stream para os eventos do chat.
 * Cada evento é `data: <json ChatStreamEvent>` terminado por linha em branco. Aceita \n ou \r\n,
 * eventos com várias linhas `data:`, comentários (`:`) e pedaços cortados no meio.
 * Eventos que não batem com o contrato são descartados (nunca quebram a tela).
 */
export function createSseParser(onEvent: (event: ChatStreamEvent) => void) {
  let buffer = "";

  const dispatch = (raw: string) => {
    const data = raw
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) return;
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const parsed = ChatStreamEvent.safeParse(json);
    if (parsed.success) onEvent(parsed.data);
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      for (;;) {
        const match = /\r?\n\r?\n/.exec(buffer);
        if (!match) break;
        const raw = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        dispatch(raw);
      }
    },
    /** Fim do stream: processa o que sobrou sem a linha em branco final. */
    flush() {
      if (buffer.trim()) dispatch(buffer);
      buffer = "";
    },
  };
}

export type StreamOutcome = "completed" | "interrupted";

/**
 * Lê o corpo SSE de uma resposta, emitindo cada evento. Devolve "interrupted" se a conexão caiu
 * antes de um evento terminal (done | paused | error) — o chamador então reconcilia com GET /api/chat,
 * já que o servidor termina o turno mesmo sem o cliente.
 */
export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<StreamOutcome> {
  let terminal = false;
  const parser = createSseParser((event) => {
    if (event.type === "done" || event.type === "paused" || event.type === "error") terminal = true;
    onEvent(event);
  });
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.flush();
  } catch {
    return terminal ? "completed" : "interrupted";
  }
  return terminal ? "completed" : "interrupted";
}
