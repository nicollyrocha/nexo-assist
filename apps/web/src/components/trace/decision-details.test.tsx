// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ConsoleMessages } from "@/components/console/console-messages";
import { AgentMessage, type BlockContext } from "@/components/chat/messages";
import { consoleConversation, message, NOW, trace } from "@/test/fixtures";
import { DecisionDetails } from "./decision-details";

const lowTrace = trace({
  id: "tr-low",
  intent: "complementar_chamado",
  confidence: { level: "baixa", score: 0.41, reason: "Não ficou claro qual chamado complementar." },
  outcome: "transferiu",
  actions: [
    {
      tool: "list_my_tickets",
      label: "consultou seus chamados",
      inputSummary: "abertos",
      outcome: "ok",
      resultSummary: "INC-20311, INC-20298",
      durationMs: 820,
      attempts: 2,
    },
    {
      tool: "transfer_to_analyst",
      label: "chamou um analista",
      inputSummary: "baixa_confianca",
      outcome: "ok",
      resultSummary: "transferência automática por baixa confiança",
      durationMs: 0,
      attempts: 1,
    },
  ],
  rulesApplied: [{ rule: "transferencia", explanation: "Sem segurança, o caso vai para um analista." }],
});

describe("DecisionDetails — variante do funcionário (chat)", () => {
  it("mostra entendimento, ações em linguagem humana, segurança sem número e regras com rótulo legível", () => {
    render(<DecisionDetails trace={lowTrace} blocks={[]} audience="employee" id="d" labelledBy="b" />);
    const region = screen.getByRole("region");
    expect(within(region).getByText("O que entendi")).toBeInTheDocument();
    expect(within(region).getByText(lowTrace.understanding)).toBeInTheDocument();
    // Ação humanizada: nunca o resultSummary cru com ids internos.
    expect(region).toHaveTextContent("consultou seus chamados — encontrei 2 chamados seus");
    expect(region).not.toHaveTextContent("INC-20311, INC-20298");
    expect(region).toHaveTextContent("Chamei um analista. Ele continua a conversa por aqui.");
    // Segurança: rótulo escrito, sem percentual no chat.
    expect(region).toHaveTextContent("Baixa");
    expect(region).toHaveTextContent("Por isso chamei um analista.");
    expect(region).not.toHaveTextContent("41%");
    // Regra do Anexo A com rótulo humano, não o id.
    expect(within(region).getByText("Transferência para analista")).toBeInTheDocument();
    expect(region).not.toHaveTextContent("transferencia");
    // Sem pílula de intenção nem rodapé técnico no chat.
    expect(region).not.toHaveTextContent("Complementar um chamado");
    expect(region).not.toHaveTextContent("tokens de entrada");
  });
});

describe("DecisionDetails — variante do analista (console)", () => {
  it("mostra intenção legível, número da confiança, limiar, tentativas e rodapé técnico", () => {
    render(<DecisionDetails trace={lowTrace} blocks={[]} audience="analyst" id="d" labelledBy="b" />);
    const region = screen.getByRole("region");
    expect(within(region).getByText("Complementar um chamado")).toBeInTheDocument();
    expect(region).toHaveTextContent("Baixa · 41% — transferência automática");
    expect(region).toHaveTextContent("Abaixo de 60% o caso vai automaticamente para um analista");
    expect(region).toHaveTextContent("INC-20311, INC-20298");
    expect(region).toHaveTextContent("2 tentativas");
    expect(region).toHaveTextContent("Quando o funcionário pede, o caso é crítico");
    expect(region).toHaveTextContent("Nada descartado neste turno.");
    expect(region).toHaveTextContent("1.820 tokens de entrada (1.200 do cache)");
    expect(region).toHaveTextContent("2,4 s");
  });

  it("no console, baixa confiança abre o detalhe por padrão, com destaque e badge", () => {
    const detail = consoleConversation({
      messages: [
        message({ id: "e1", content: "Quero complementar meu chamado" }),
        message({ id: "a1", role: "agent", authorId: null, authorName: "Nexo Assist", content: "Vou chamar um analista.", traceId: "tr-low" }),
      ],
      traces: { "tr-low": lowTrace },
    });
    render(<ConsoleMessages detail={detail} me={{ userId: "an-1", name: "Rafael Lima", email: "r@nexo.com.br", detail: "N2", role: "analista" }} now={NOW} onFocusTicket={() => {}} />);
    expect(screen.getByText("Confiança baixa, 41 por cento")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Por que o assistente respondeu assim" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const region = screen.getByRole("region", { name: "Por que o assistente respondeu assim" });
    expect(region.className).toContain("border-confianca-baixa");
  });

  it("confiança alta no console: sem badge e detalhe fechado", () => {
    const detail = consoleConversation({
      messages: [message({ id: "a1", role: "agent", authorId: null, authorName: "Nexo Assist", content: "Está aguardando analista.", traceId: "tr-1" })],
      traces: { "tr-1": trace() },
    });
    render(<ConsoleMessages detail={detail} me={{ userId: "an-1", name: "Rafael", email: "r@nexo.com.br", detail: "N2", role: "analista" }} now={NOW} onFocusTicket={() => {}} />);
    expect(screen.queryByText(/Confiança/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Por que o assistente respondeu assim" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Por que o assistente respondeu assim" })).not.toBeInTheDocument();
  });
});

describe("Chips + Por quê? no chat", () => {
  it("chips vêm do trace (com derivados) e o detalhe abre fechado por padrão", async () => {
    const agent = message({ id: "a1", role: "agent", authorId: null, authorName: "Nexo Assist", content: "Está sem atualização há 5 dias.", traceId: "tr-1" });
    const t = trace();
    const ctx: BlockContext = {
      messages: [agent],
      traces: { "tr-1": t },
      now: NOW,
      canAct: true,
      latestAgentIndex: 0,
      disabledNote: null,
      busyDraft: null,
      onSend: () => {},
    };
    render(<AgentMessage message={{ ...agent, blocks: [{ kind: "ticket_cards", tickets: [(await import("@/test/fixtures")).ticket()] }] }} index={0} ctx={ctx} />);
    const chips = screen.getByRole("list", { name: "O que o assistente fez" });
    expect(chips).toHaveTextContent("consultou o INC-20311");
    expect(chips).toHaveTextContent("calculou o prazo");
    const toggle = screen.getByRole("button", { name: "Por que o assistente respondeu assim" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "Por que o assistente respondeu assim" })).toHaveTextContent("vi o status e o prazo");
  });
});
