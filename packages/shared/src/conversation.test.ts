import { describe, expect, it } from "vitest";
import { canTransition, isAgentPaused } from "./conversation";

describe("ciclo da conversa", () => {
  it("o agent fica pausado enquanto a conversa está com o analista", () => {
    expect(isAgentPaused("aguardando_atendente")).toBe(true);
    expect(isAgentPaused("em_atendimento")).toBe(true);
    expect(isAgentPaused("ativa")).toBe(false);
  });

  it("analista assume, devolve ao agent ou encerra", () => {
    expect(canTransition("ativa", "aguardando_atendente")).toBe(true);
    expect(canTransition("aguardando_atendente", "em_atendimento")).toBe(true);
    expect(canTransition("em_atendimento", "ativa")).toBe(true);
    expect(canTransition("em_atendimento", "encerrada")).toBe(true);
  });

  it("não pula etapas nem reabre conversa encerrada", () => {
    expect(canTransition("ativa", "em_atendimento")).toBe(false);
    expect(canTransition("encerrada", "ativa")).toBe(false);
  });
});
