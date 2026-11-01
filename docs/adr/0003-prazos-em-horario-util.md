# 0003 — Prazos em horário útil

- Status: aceita
- Data: 2026-11-01

## Contexto
O Anexo A define prazos em "horas úteis" e "dias úteis", mas não o horário útil.

## Decisão
- Horário útil: segunda a sexta, 8h–18h, `America/Sao_Paulo` (artigo "Horário do service desk").
- Crítica: 1 hora corrida (plantão 24h para críticos).
- "N dias úteis" = N × 10 horas úteis — equivale ao mesmo horário N dias úteis depois.
- O prazo é recalculado a partir da última atualização do analista; vencido = agora > prazo.
- Feriados ficam fora do protótipo.

Implementação e casos de borda testados em `packages/shared/src/sla.ts`.

## Consequências
O prazo é calculado em código, nunca pelo modelo: o agent só lê `dueAt` e informa.
