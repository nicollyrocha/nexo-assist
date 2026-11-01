---
description: Implementa uma feature ponta a ponta orquestrando os especialistas (design, banco, backend, frontend)
argument-hint: <descrição da feature ou número da história>
---

Feature: $ARGUMENTS

1. Releia `CLAUDE.md`. Identifique quais histórias, telas e critérios de sucesso a feature toca, e quais regras
   do Anexo A se aplicam. Se faltar informação de um anexo, pare e pergunte.
2. Defina/atualize os contratos em `packages/shared` (tipos + schemas zod).
3. Em paralelo (Agent tool, uma mensagem com várias chamadas), quando independentes:
   - `design-specialist`: spec da(s) tela(s)/componente(s) em `docs/design/`.
   - `database-specialist`: schema, migração e seeds necessários.
4. `backend-specialist`: endpoints, ferramentas do agent, `DecisionTrace` e testes.
5. `frontend-specialist`: implementação pixel-perfect a partir da spec e verificação no navegador.
6. Rode `/check`. Mostre o resultado real.
7. Resuma: o que foi feito, quais critérios de sucesso avançaram, decisões tomadas (crie ADR se relevante) e
   pendências. Proponha a mensagem de commit (Conventional Commits, pt-BR) — não commite sem pedido.
