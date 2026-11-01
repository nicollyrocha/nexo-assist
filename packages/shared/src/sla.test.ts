import { describe, expect, it } from "vitest";
import { addBusinessMinutes, computeDueAt, isOverdue } from "./sla";

// Novembro de 2026: dia 2 é segunda-feira. Horários em America/Sao_Paulo (UTC-3).
const at = (isoLocal: string) => new Date(`${isoLocal}-03:00`);

describe("computeDueAt", () => {
  it.each([
    ["alta dentro do expediente", "alta", "2026-11-02T10:00:00", "2026-11-02T14:00:00"],
    ["alta terminando exatamente às 18h", "alta", "2026-11-02T14:00:00", "2026-11-02T18:00:00"],
    ["alta na sexta 17h atravessa o fim de semana", "alta", "2026-11-06T17:00:00", "2026-11-09T11:00:00"],
    ["alta no sábado começa na segunda 8h", "alta", "2026-11-07T10:00:00", "2026-11-09T12:00:00"],
    ["alta antes do expediente começa às 8h", "alta", "2026-11-03T07:00:00", "2026-11-03T12:00:00"],
    ["alta depois do expediente começa no dia seguinte", "alta", "2026-11-03T19:00:00", "2026-11-04T12:00:00"],
    ["média: mesmo horário 3 dias úteis depois", "media", "2026-11-02T10:00:00", "2026-11-05T10:00:00"],
    ["média na quarta pula o fim de semana", "media", "2026-11-04T10:00:00", "2026-11-09T10:00:00"],
    ["baixa: 5 dias úteis", "baixa", "2026-11-02T10:00:00", "2026-11-09T10:00:00"],
    ["crítica conta 1 hora corrida, mesmo no sábado de madrugada", "critica", "2026-11-07T03:00:00", "2026-11-07T04:00:00"],
  ] as const)("%s", (_name, priority, from, expected) => {
    expect(computeDueAt(priority, at(from)).toISOString()).toBe(at(expected).toISOString());
  });
});

describe("addBusinessMinutes", () => {
  it("zero minutos fora do expediente devolve a próxima abertura", () => {
    expect(addBusinessMinutes(at("2026-11-08T12:00:00"), 0).toISOString()).toBe(
      at("2026-11-09T08:00:00").toISOString(),
    );
  });
});

describe("isOverdue", () => {
  it("chamado médio sem atualização há 6 dias está vencido (INC-20311 do Anexo B)", () => {
    const lastUpdate = at("2026-10-26T09:00:00");
    const due = computeDueAt("media", lastUpdate);
    expect(isOverdue(due, at("2026-11-01T09:00:00"))).toBe(true);
  });

  it("no limite exato ainda não está vencido", () => {
    const due = at("2026-11-02T14:00:00");
    expect(isOverdue(due, due)).toBe(false);
  });

  it("chamado fechado (sem prazo) nunca está vencido", () => {
    expect(isOverdue(null, at("2026-11-02T14:00:00"))).toBe(false);
  });
});
