// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ProfileApp } from "./profile-app";

const user = { userId: "emp-ana", name: "Ana Souza", email: "ana.souza@nexo.com.br", detail: "Financeiro", role: "funcionario" as const };

describe("ProfileApp", () => {
  it("mostra nome e e-mail da sessão e marca Meu perfil como ativo", () => {
    render(<ProfileApp user={user} />);
    expect(screen.getByRole("heading", { name: "Meu perfil" })).toBeTruthy();
    expect(screen.getAllByText("Ana Souza").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ana.souza@nexo.com.br").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gerenciado pela TI").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Meu perfil" })[0].getAttribute("aria-current")).toBe("page");
    expect(screen.getAllByRole("link", { name: "Atendimento" })[0].getAttribute("href")).toBe("/chat");
  });

  it("Redefinir senha orienta ligar no ramal, sem afirmar que enviou algo", async () => {
    render(<ProfileApp user={user} />);
    await userEvent.click(screen.getByRole("button", { name: "Redefinir senha" }));
    expect(screen.getByRole("dialog", { name: "Redefinir senha" }).textContent).toContain("ramal 4000");
    expect(screen.queryByText(/enviamos|enviado/i)).toBeNull();
  });
});
