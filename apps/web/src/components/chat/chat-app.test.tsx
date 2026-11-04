// @vitest-environment jsdom
import type { ChatStreamEvent, ConversationView } from "@nexo/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conversationView, message, trace } from "@/test/fixtures";
import { ChatApp } from "./chat-app";

const user = { userId: "emp-ana", name: "Ana Souza", email: "ana.souza@nexo.com.br", detail: "Financeiro", role: "funcionario" as const };

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let handler: Handler;
const calls: { url: string; body?: unknown }[] = [];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sse = (events: ChatStreamEvent[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return handler(url, init);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const serve = (view: ConversationView, onPost?: Handler) => {
  handler = (url, init) => {
    if (url === "/api/chat" && (!init?.method || init.method === "GET")) return json(view);
    if (onPost) return onPost(url, init);
    return json({ error: { code: "not_found", message: "?" } }, 404);
  };
};

describe("ChatApp — bloqueio do input", () => {
  it("no limite de 30 mensagens: sem composer, aviso com 'Sair e entrar de novo' e cards sem ação", async () => {
    serve(conversationView({ messagesUsed: 30, messagesLimit: 30 }));
    render(<ChatApp user={user} />);
    expect(await screen.findByText("Esta sessão chegou ao limite de 30 mensagens")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Mensagem para/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sair e entrar de novo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Confirmar e criar o chamado" })).toBeDisabled();
  });

  it("contador está sempre visível e, perto do limite, mostra o que resta", async () => {
    serve(conversationView({ messagesUsed: 16 }));
    const first = render(<ChatApp user={user} />);
    expect(await screen.findByText("16/30 mensagens nesta sessão")).toBeInTheDocument();
    first.unmount();
    serve(conversationView({ messagesUsed: 26 }));
    render(<ChatApp user={user} />);
    expect(await screen.findByText("26/30 mensagens nesta sessão · restam 4")).toBeInTheDocument();
  });

  it("erro limit_reached no envio bloqueia o input e devolve o texto não enviado", async () => {
    serve(conversationView({ messagesUsed: 29 }), (url) =>
      url === "/api/chat/messages" ? sse([{ type: "error", error: { code: "limit_reached", message: "limite" } }]) : json({}, 404),
    );
    render(<ChatApp user={user} />);
    const box = await screen.findByRole("textbox", { name: "Mensagem para o Nexo Assist" });
    await userEvent.type(box, "Mais uma pergunta{Enter}");
    expect(await screen.findByText("Esta sessão chegou ao limite de 30 mensagens")).toBeInTheDocument();
  });

  it("com analista (pausado): aviso explica, input aberto para o analista e rascunho travado", async () => {
    const view = conversationView({ analystName: "Rafael Lima", analystTier: "N2" });
    view.conversation = { ...view.conversation, status: "em_atendimento", assignedAnalystId: "an-1" };
    serve(view);
    render(<ChatApp user={user} />);
    expect(await screen.findByText("Rafael Lima está atendendo você")).toBeInTheDocument();
    expect(screen.getByText("Suas mensagens vão direto para o analista. O assistente está pausado.")).toBeInTheDocument();
    const box = screen.getByRole("textbox", { name: "Mensagem para o analista" });
    expect(box).toBeEnabled();
    expect(box).toHaveAttribute("placeholder", "Escreva para o analista…");
    expect(screen.getByRole("button", { name: "Confirmar e criar o chamado" })).toBeDisabled();
    expect(screen.getByText("O assistente está pausado enquanto o analista atende.")).toBeInTheDocument();
  });

  it("aguardando atendente: envio salva e o stream pausa sem 'trabalhando…'", async () => {
    const view = conversationView();
    view.conversation = { ...view.conversation, status: "aguardando_atendente", transferReason: "pedido_do_funcionario" };
    const saved = message({ id: "m-9", content: "Mais um detalhe", createdAt: "2026-10-21T13:00:00.000Z" });
    serve(view, (url) => {
      if (url !== "/api/chat/messages") return json({}, 404);
      view.messages = [...view.messages, saved]; // o GET seguinte já traz a mensagem gravada
      return sse([
        { type: "saved", message: saved, messagesUsed: 3 },
        { type: "paused", conversation: view.conversation },
      ]);
    });
    render(<ChatApp user={user} />);
    expect(await screen.findByText("Chamei um analista para você")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Mensagem para o analista" }), "Mais um detalhe{Enter}");
    expect(await screen.findByRole("article", { name: "Você, 10:00" })).toHaveTextContent("Mais um detalhe");
    expect(screen.queryByText("trabalhando…")).not.toBeInTheDocument();
  });
});

describe("ChatApp — streaming e rascunho", () => {
  it("Confirmar envia a frase fixa; chips chegam ao vivo e o card vira 'Criado como'", async () => {
    const view = conversationView();
    const created = trace({
      id: "tr-2",
      intent: "confirmar_rascunho",
      outcome: "criou_chamado",
      actions: [
        { tool: "confirm_pending_action", label: "registrou", inputSummary: "act-1", outcome: "ok", resultSummary: "criado INC-20517", durationMs: 900, attempts: 1 },
      ],
    });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    serve(view, async (url, init) => {
      if (url !== "/api/chat/messages") return json({}, 404);
      const text = JSON.parse(String(init?.body)).text as string;
      const enc = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        async start(c) {
          const push = (e: ChatStreamEvent) => c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
          push({ type: "saved", message: message({ id: "m-3", content: text, createdAt: "2026-10-21T13:00:00.000Z" }), messagesUsed: 3 });
          push({ type: "action", action: created.actions[0] });
          await gate;
          push({ type: "text", delta: "Pronto, criei o INC-20517." });
          push({
            type: "done",
            message: message({ id: "m-4", role: "agent", authorId: null, authorName: "Nexo Assist", content: "Pronto, criei o INC-20517.", traceId: "tr-2", createdAt: "2026-10-21T13:00:05.000Z" }),
            trace: created,
            conversation: view.conversation,
          });
          c.close();
        },
      });
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    });
    render(<ChatApp user={user} />);
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar e criar o chamado" }));
    expect(calls.find((c) => c.url === "/api/chat/messages")?.body).toEqual({ text: "Confirmo, pode criar o chamado." });
    // Chip ao vivo antes do texto; botão do card mostra o andamento.
    expect(await screen.findByText("registrou")).toBeInTheDocument();
    expect(screen.getByText("Criando…")).toBeInTheDocument();
    release();
    expect(await screen.findByText("Criado como INC-20517")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("criou o chamado INC-20517")).toBeInTheDocument());
  });
});
