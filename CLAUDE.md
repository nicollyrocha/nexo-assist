# Nexo Assist — guia do projeto

Agent de atendimento em chat para funcionários da Nexo. O funcionário descreve o problema com as próprias
palavras; o agent consulta os chamados dele, busca na central de ajuda, abre ou atualiza chamados e transfere
para um analista (Suporte N1/N2) quando precisa. Do outro lado, o analista usa um console para assumir,
devolver e encerrar conversas.

## Fontes da verdade (ler antes de decidir)

| Documento | Onde | Para quê |
|---|---|---|
| Anexo A — Regras do service desk | `docs/anexos/A-regras-service-desk.md` | Tipo, categoria, prioridade, prazos, duplicidade, transferência, privacidade, escopo. **O agent nunca contradiz este anexo.** |
| Anexo B — Dados de exemplo | `docs/anexos/B-dados-exemplo.md` | Artigos e chamados de exemplo + o que os seeds precisam cobrir. |
| Anexo C — Protótipo (Telas 1–5) | `docs/anexos/C-prototipo/` (PNG + HTML exportado do Pencil, link no README) | Referência visual. Seguir layout e estilo; liberdade nos detalhes. |
| Specs de design | `docs/design/` | Tokens e specs por tela, escritas pelo `design-specialist`. |
| Decisões de arquitetura | `docs/adr/` | Um ADR curto por decisão relevante (o desafio pede decisões justificadas). |

Não invente regras do service desk. Se algo não estiver no Anexo A nem nas notas de implementação dele,
pergunte ao usuário.

## Critérios de sucesso (todo trabalho é medido contra eles)

1. **Resolução sem fila** — dúvidas e consultas resolvidas no próprio chat.
2. **Chamados bem abertos** — completos, com tipo/categoria/prioridade corretos, **sem duplicidade**.
3. **Encaminhamento certo** — o que precisa de pessoa chega ao analista na hora certa e com contexto.
4. **Transparência** — dá para entender o que o agent fez e por quê em cada resposta. *(parte mais importante)*

## Histórias

**Funcionário:** (1) tirar dúvida sem chamado · (2) ver status de chamado sem lembrar o número, e se está
vencido · (3) complementar chamado aberto · (4) abrir chamado conversando, conferindo rascunho antes de criar ·
(5) falar com analista quando quiser ou quando for grave · (6) voltar outro dia e continuar de onde parou.

**Analista:** (1) receber chamados bem classificados e descritos · (2) ver conversas que precisam dele, inclusive
as de baixa confiança do agent · (3) assumir conversa (agent pausado), devolver ao agent ou encerrar.

## Escopo a construir

1. Login (Tela 1) — e-mail corporativo + qualquer senha para funcionários dos dados de exemplo.
2. Chat do funcionário (Telas 2–3) — streaming, cards de chamado, seleção de chamado, rascunho para confirmação,
   opções rápidas, **limite de 30 mensagens por sessão**.
3. Agent — decide a ação a cada mensagem usando central de ajuda + serviço de chamados, seguindo o Anexo A.
4. Serviço de chamados simulado — **separado do agent**; consultar, criar, atualizar, transferir. Simula o
   legado: indisponibilidade ocasional de alguns segundos.
5. Transferência — conversa fica "aguardando atendente"; agent não responde até ser liberado.
6. Console do analista (Telas 4–5) — lista com filtros/status, histórico, assumir/devolver/encerrar, painel com
   chamados do funcionário.
7. Visibilidade das decisões — chips de ação acima de cada resposta ("consultou seus chamados",
   "classificou a prioridade") + detalhe expansível: **o que entendeu, que ação tomou, confiança e por quê**.

## Stack (definida pelo usuário)

- **Front:** React + Next.js (App Router) + Tailwind CSS + TypeScript estrito.
- **Back:** Node (Route Handlers do Next.js em runtime Node) + **Neon** (Postgres serverless) via
  `@neondatabase/serverless` + Drizzle ORM/migrações.
- **Deploy:** Vercel (projetos separados para o app e para o serviço de chamados; Neon com branch por preview).
- **Modelo:** SDK `@anthropic-ai/sdk` com tool use, streaming e prompt caching.
- **Testes:** Vitest (unidade/integração), Playwright (e2e), evals do agent.
- **Monorepo:** pnpm workspaces.

Qualquer biblioteca além dessas precisa de justificativa (ADR curto).

## Arquitetura (camadas — não misturar)

```
apps/web          Next.js: telas (login, chat, console) + Route Handlers (auth, conversas, streaming SSE).
                  Orquestra o agent; não contém regra de negócio de chamados.
packages/agent    Loop do agent: prompt, ferramentas, regras do Anexo A, DecisionTrace. Sem acesso direto
                  a banco nem a fetch — recebe clientes injetados (tickets, central de ajuda, trace store).
apps/tickets      Serviço de chamados simulado: API HTTP própria (Node), banco próprio no Neon, falhas
                  simuladas do legado. Deploy separado na Vercel.
packages/shared   Contratos (tipos + schemas zod): Ticket, Conversation, Message, DecisionTrace…
packages/db       Schemas Drizzle e migrações do banco da aplicação (conversas, mensagens, traces).
docs/             Anexos, specs de design, ADRs.
```

## Regras invioláveis

- **Isolamento por funcionário:** toda consulta de chamado é filtrada pelo `employeeId` da sessão autenticada,
  no servidor. O agent nunca recebe um id de funcionário vindo do texto do usuário. Testar explicitamente.
- **Chaves fora do código:** variáveis de ambiente (Vercel + `.env.local` ignorado), documentadas em
  `.env.example`. Nunca logar chaves nem PII desnecessária no trace. Nada de segredo em `NEXT_PUBLIC_*`.
- **Nada é criado ou atualizado sem confirmação:** sempre passa por rascunho confirmado pelo funcionário.
- **Antes de criar, checar duplicidade** contra os chamados abertos do funcionário; resolvido há ≤7 dias pode
  ser reaberto.
- **Legado instável:** chamadas ao serviço de chamados com timeout, retry com backoff e idempotency key;
  mensagem honesta se falhar — nunca fingir que criou/atualizou.
- **Agent pausado = agent mudo:** com conversa em `aguardando_atendente` ou `em_atendimento`, nenhuma chamada ao
  modelo é feita.
- **Fora de TI → redirecionar**, sem abrir chamado.
- **Todo turno do agent gera um `DecisionTrace`** persistido (entendimento, intenção, ações + resultado,
  confiança, justificativa, regra do Anexo A aplicada, tokens). A UI renderiza a partir dele, não de texto livre.
- **Custo por conversa:** prompt caching do system prompt + Anexo A, modelo menor para tarefas simples quando
  bastar, histórico resumido em conversas longas. Registrar tokens por turno no trace.

## Como trabalhar aqui

- Idioma do produto e dos textos de UI: **português do Brasil**. Código e identificadores: inglês.
- Especialistas (via Agent tool, em paralelo quando as tarefas forem independentes):
  - `design-specialist` — UX e direção visual: fluxos, estados, microcopy, tokens a partir do protótipo; desenha
    como a transparência das decisões aparece. Não escreve código de produção.
  - `frontend-specialist` — implementa `apps/web` (Next.js + Tailwind) pixel-perfect contra o protótipo.
  - `backend-specialist` — Route Handlers, agent, serviço de chamados, streaming, resiliência, custo do modelo.
  - `database-specialist` — Neon/Drizzle: modelagem, migrações, seeds, índices, isolamento de dados.
- Fluxo por feature: spec de design + contrato em `packages/shared` → banco → backend → frontend → teste.
  `/feature` orquestra; `/design-review` compara uma tela com o protótipo; `/check` valida.
- Testes onde fazem diferença: regras do Anexo A (classificação, prioridade, prazo em horas/dias úteis,
  vencimento), duplicidade/reabertura, isolamento entre funcionários, pausa do agent, retry do legado,
  limite de 30 mensagens. Evals do agent em `packages/agent/evals`.
- Commits pequenos que contem a história (Conventional Commits, em português). Não commitar nem fazer deploy
  sem pedido.
