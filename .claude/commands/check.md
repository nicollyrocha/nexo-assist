---
description: Roda lint, typecheck, testes e evals do agent e reporta o resultado real
---

Rode, a partir da raiz, e reporte a saída real de cada etapa (sem resumir falhas como sucesso):

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test`
4. Se algo em `packages/agent` mudou: `pnpm --filter @nexo/agent eval`

Se um script ainda não existir, diga isso em vez de pular em silêncio. Para falhas, aponte arquivo:linha e a
causa provável antes de propor correção.
