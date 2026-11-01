---
description: Compara uma tela implementada com o protótipo (Anexo C) e a spec de design
argument-hint: <tela, ex.: "Tela 2 - chat">
---

Use o `frontend-specialist` para revisar a fidelidade de: $ARGUMENTS

- Abra a tela no navegador do app em 1440px e 375px e compare com `docs/anexos/C-prototipo/` e a spec em
  `docs/design/`.
- Liste divergências em tabela: elemento | esperado | atual | severidade (quebra layout / visível / sutil).
- Cheque estados (streaming, erro do legado, agent pausado, limite de 30 mensagens, rascunho, prazo vencido, fora de TI) e
  acessibilidade (foco, contraste, `aria-live`).
- Não corrija nada sem perguntar; ao final, pergunte quais divergências corrigir.
