import { describe, expect, it } from "vitest";
import { draftBlock, ticket, trace } from "@/test/fixtures";
import { buildChips, chipText, humanResult, outcomeText } from "./trace-copy";

const action = trace().actions[0];

describe("chips de ação", () => {
  it("texto por ferramenta e resultado, com o id do chamado", () => {
    expect(chipText(action)).toBe("consultou o INC-20311");
    expect(chipText({ ...action, outcome: "sem_resultado" })).toBe("não encontrou o INC-20311 entre os seus chamados");
    expect(chipText({ ...action, outcome: "erro" })).toBe("não conseguiu consultar o INC-20311");
  });

  it("derivados: rascunho ganha prioridade + prazo antes do chip da proposta", () => {
    const propose = { ...action, tool: "propose_new_ticket" as const, inputSummary: "rede_vpn", resultSummary: "act-1" };
    expect(buildChips([propose], [draftBlock]).map((c) => c.text)).toEqual([
      "classificou a prioridade como Alta",
      "calculou o prazo",
      "montou o rascunho do chamado",
    ]);
  });

  it("derivados: cartão com prazo depois da consulta; fora de TI no fim; tentativas no chip", () => {
    const chips = buildChips([{ ...action, attempts: 3 }], [{ kind: "ticket_cards", tickets: [ticket()] }], "redirecionou");
    expect(chips.map((c) => c.text)).toEqual(["consultou o INC-20311", "calculou o prazo", "viu que o assunto não é de TI"]);
    expect(chips[0].attempts).toBe(3);
  });

  it("resumo humano nunca expõe ids internos; erro diz as tentativas", () => {
    expect(humanResult({ ...action, tool: "propose_new_ticket", resultSummary: "proposta act-123" })).toBe("rascunho pronto, esperando sua confirmação");
    expect(humanResult({ ...action, outcome: "erro", attempts: 3 })).toBe("o sistema de chamados não respondeu (3 tentativas)");
  });

  it("resultado do turno em 1ª pessoa no chat e 3ª no console", () => {
    expect(outcomeText("criou_chamado", "employee", "INC-20517")).toBe("Criei o chamado INC-20517.");
    expect(outcomeText("criou_chamado", "analyst", "INC-20517")).toBe("Criou o chamado INC-20517.");
  });
});
