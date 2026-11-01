# 0002 — Dados: dois bancos no Neon, Drizzle e PGlite nos testes

- Status: aceita
- Data: 2026-11-01

## Contexto
O agent não pode acessar o legado diretamente, chamados de um funcionário nunca podem vazar para outro e
o console precisa filtrar decisões por confiança.

## Decisão
- **Dois bancos Neon**: o do serviço de chamados (funcionários, analistas, chamados, eventos, central de
  ajuda) e o da aplicação (sessões, conversas, mensagens, DecisionTraces). Cada serviço é dono do seu.
- **Drizzle** com migrações versionadas (`drizzle-kit generate` + `migrate`); driver `neon-http` em runtime.
- **Isolamento no acesso a dados**: toda função de leitura do lado do funcionário exige o id dele; não há
  busca de chamado só pelo código.
- **DecisionTrace** em `jsonb` + colunas extraídas (intenção, resultado, confiança, tokens) para filtros e custo.
- **Concorrência**: assumir conversa usa controle otimista (`version`).
- **Limite de 30 mensagens**: contador atômico na sessão (`UPDATE … WHERE message_count < 30`).
- **Central de ajuda**: full-text em português do Postgres (`to_tsvector('portuguese')`, índice GIN), com
  as palavras da pergunta em OR. Suficiente para 5–10 artigos; sem embeddings.
- **Testes com PGlite**: Postgres em memória com as migrações reais, sem depender do Neon nem de rede.

## Alternativas consideradas
- Um banco com dois schemas: menos custo, mas mistura os donos dos dados.
- Busca semântica com embeddings: melhor recall, mas custo e complexidade desproporcionais para poucos artigos.

## Consequências
Os seeds dependem de `now` (datas relativas) para que "vencido" e "resolvido há 4 dias" continuem verdadeiros.
