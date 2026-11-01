# 0001 — Monorepo e separação em camadas

- Status: aceita
- Data: 2026-11-01

## Contexto
O desafio pede separação clara entre interface, agent e serviços, e um serviço de chamados simulado
**separado do agent**. A stack foi definida pelo usuário: Next.js + Tailwind + TypeScript, Node, Neon, Vercel.

## Decisão
Monorepo pnpm com:
- `apps/web` — Next.js: telas e Route Handlers (auth, conversas, streaming). Orquestra o agent.
- `apps/tickets` — Next.js só com Route Handlers: o "legado" simulado, com banco próprio e deploy próprio.
- `packages/shared` — contratos zod e regras puras do Anexo A (prazos, ciclo da conversa).
- `packages/db` — schema e acesso ao banco da aplicação.
- `packages/agent` (próxima etapa) — loop do agent, sem I/O próprio: recebe clientes injetados.

Pacotes internos são consumidos como TypeScript fonte (`transpilePackages`), sem etapa de build.

## Alternativas consideradas
- Serviço de chamados como módulo dentro de `apps/web`: mais simples, mas não demonstra a fronteira de rede
  nem a instabilidade do legado (timeout, retry, idempotência).
- Hono/Express para o serviço de chamados: leve, mas Next.js mantém uma só ferramenta e deploy nativo na Vercel.

## Consequências
Dois projetos na Vercel e duas variáveis de URL/chave para conectar os serviços. As regras determinísticas
(prazo, transições) ficam testáveis isoladamente em `packages/shared`.
