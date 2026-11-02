import type { ChatStreamEvent } from "@nexo/shared";
import { describe, expect, it } from "vitest";
import { message } from "@/test/fixtures";
import { createSseParser, readChatStream } from "./sse";

const saved: ChatStreamEvent = { type: "saved", message: message(), messagesUsed: 3 };
const text = (delta: string): ChatStreamEvent => ({ type: "text", delta });
const frame = (e: unknown) => `data: ${JSON.stringify(e)}\n\n`;

function collect() {
  const events: ChatStreamEvent[] = [];
  const parser = createSseParser((e) => events.push(e));
  return { events, parser };
}

describe("createSseParser", () => {
  it("emite eventos completos e guarda pedaços cortados no meio", () => {
    const { events, parser } = collect();
    const all = frame(saved) + frame(text("Olá"));
    parser.push(all.slice(0, 17));
    expect(events).toHaveLength(0);
    parser.push(all.slice(17, all.length - 3));
    expect(events).toEqual([saved]);
    parser.push(all.slice(all.length - 3));
    expect(events).toEqual([saved, text("Olá")]);
  });

  it("aceita \r\n, comentários e várias linhas data:", () => {
    const { events, parser } = collect();
    parser.push(': ping\r\n\r\ndata: {"type":"text",\r\ndata: "delta":"x"}\r\n\r\n');
    expect(events).toEqual([text("x")]);
  });

  it("descarta JSON inválido e eventos fora do contrato sem quebrar", () => {
    const { events, parser } = collect();
    parser.push("data: {não é json}\n\n");
    parser.push(frame({ type: "desconhecido" }));
    parser.push(frame({ type: "text" }));
    parser.push(frame(text("ok")));
    expect(events).toEqual([text("ok")]);
  });

  it("flush processa o último evento sem a linha em branco final", () => {
    const { events, parser } = collect();
    parser.push(`data: ${JSON.stringify(text("fim"))}`);
    expect(events).toHaveLength(0);
    parser.flush();
    expect(events).toEqual([text("fim")]);
  });
});

function streamOf(chunks: string[], fail = false) {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]));
      else if (fail) controller.error(new Error("conexão caiu"));
      else controller.close();
    },
  });
}

describe("readChatStream", () => {
  it("completed quando chega um evento terminal", async () => {
    const events: ChatStreamEvent[] = [];
    const paused: ChatStreamEvent = {
      type: "error",
      error: { code: "unavailable", message: "fora do ar" },
    };
    const out = await readChatStream(streamOf([frame(saved), frame(paused)]), (e) => events.push(e));
    expect(out).toBe("completed");
    expect(events.map((e) => e.type)).toEqual(["saved", "error"]);
  });

  it("interrupted quando a conexão cai antes do fim (cliente reconcilia com GET /api/chat)", async () => {
    const events: ChatStreamEvent[] = [];
    expect(await readChatStream(streamOf([frame(saved), frame(text("Oi"))], true), (e) => events.push(e))).toBe("interrupted");
    expect(await readChatStream(streamOf([frame(saved)]), () => {})).toBe("interrupted");
    expect(events.map((e) => e.type)).toEqual(["saved", "text"]);
  });

  it("decodifica UTF-8 partido entre pedaços", async () => {
    const bytes = new TextEncoder().encode(frame(text("ação")));
    const cut = bytes.indexOf(0xc3) + 1; // no meio do "ç"
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, cut));
        c.enqueue(bytes.slice(cut));
        c.close();
      },
    });
    const events: ChatStreamEvent[] = [];
    await readChatStream(stream, (e) => events.push(e));
    expect(events).toEqual([text("ação")]);
  });
});
