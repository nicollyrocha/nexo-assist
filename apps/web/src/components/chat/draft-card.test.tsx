// @vitest-environment jsdom
import { computeDueAt } from "@nexo/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { formatDeadline } from "@/lib/format";
import { draftBlock, NOW } from "@/test/fixtures";
import { DraftCard } from "./draft-card";

function setup(overrides: Partial<Parameters<typeof DraftCard>[0]> = {}) {
  const onAction = vi.fn();
  render(<DraftCard block={draftBlock} status={{ kind: "pending" }} enabled busy={null} now={NOW} onAction={onAction} {...overrides} />);
  return { onAction };
}

describe("DraftCard (rascunho de chamado)", () => {
  it("mostra tipo, categoria, prioridade com prazo, afetados e o motivo da prioridade", () => {
    setup();
    expect(screen.getByText("Aguardando confirmação")).toBeInTheDocument();
    expect(screen.getByText("Incidente")).toBeInTheDocument();
    expect(screen.getByText("Rede e VPN")).toBeInTheDocument();
    expect(screen.getByText("Somente você")).toBeInTheDocument();
    // dueAtPreview 16:43Z = 13:43 em São Paulo, como no protótipo.
    expect(screen.getByText("· resposta até 13:43")).toBeInTheDocument();
    expect(screen.getByText(/Por que Alta: há uma reunião/)).toBeInTheDocument();
  });

  it("Confirmar envia a frase fixa de confirmação", async () => {
    const { onAction } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Confirmar e criar o chamado" }));
    expect(onAction).toHaveBeenCalledWith("confirm", "Confirmo, pode criar o chamado.");
  });

  it("Ctrl+Enter dentro do card confirma", async () => {
    const { onAction } = setup();
    screen.getByRole("button", { name: "Ajustar o rascunho" }).focus();
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(onAction).toHaveBeenCalledWith("confirm", "Confirmo, pode criar o chamado.");
  });

  it("Cancelar envia a frase de cancelamento", async () => {
    const { onAction } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar o rascunho" }));
    expect(onAction).toHaveBeenCalledWith("cancel", "Pode cancelar, não quero abrir esse chamado.");
  });

  it("Ajustar: foco no 1º campo; mudar a prioridade recalcula o prazo com computeDueAt e envia só o que mudou", async () => {
    const { onAction } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Ajustar o rascunho" }));
    await waitFor(() => expect(screen.getByLabelText("Título")).toHaveFocus());
    const send = screen.getByRole("button", { name: "Enviar ajustes" });
    expect(send).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText("Prioridade"), "media");
    const expected = `resposta ${formatDeadline(computeDueAt("media", NOW), NOW)}`;
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(expected).toBe("resposta até 26 out, 10:00"); // 3 dias úteis a partir de qua 10:00
    expect(screen.getByText(/vai reavaliar a prioridade/)).toBeInTheDocument();

    await userEvent.click(send);
    expect(onAction).toHaveBeenCalledWith("adjust", "Quero ajustar o rascunho: prioridade: Média.");
  });

  it("Descartar ajustes volta ao card e devolve o foco ao Ajustar", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Ajustar o rascunho" }));
    await userEvent.click(screen.getByRole("button", { name: "Descartar ajustes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Ajustar o rascunho" })).toHaveFocus());
  });

  it("com o agent pausado, botões desabilitados e explicação na barra", () => {
    setup({ enabled: false, disabledNote: "O assistente está pausado enquanto o analista atende." });
    expect(screen.getByRole("button", { name: "Confirmar e criar o chamado" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ajustar o rascunho" })).toBeDisabled();
    expect(screen.getByText("O assistente está pausado enquanto o analista atende.")).toBeInTheDocument();
  });

  it("criado: mostra o número e some a barra de ações; falha: alerta honesto e Tentar de novo", () => {
    const { unmount } = render(
      <DraftCard block={draftBlock} status={{ kind: "created", ticketId: "INC-20517", verb: "criado" }} enabled busy={null} now={NOW} onAction={() => {}} />,
    );
    expect(screen.getByText("Criado como INC-20517")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirmar/ })).not.toBeInTheDocument();
    unmount();
    render(<DraftCard block={draftBlock} status={{ kind: "failed", attempts: 3 }} enabled busy={null} now={NOW} onAction={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("O sistema de chamados não respondeu (3 tentativas). Nada foi criado.");
    expect(screen.getByRole("button", { name: "Tentar confirmar de novo" })).toBeEnabled();
  });
});
