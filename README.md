# Nexo Assist

Agent de atendimento de TI em chat. O funcionário da Nexo descreve o problema com as próprias palavras; o
agent consulta os chamados dele, busca na central de ajuda, abre ou atualiza chamados (sempre com rascunho
confirmado) e transfere para um analista quando precisa. O analista usa um console para assumir a conversa
(com o agent pausado), devolvê-la ao agent ou encerrá-la.

**A parte central é a transparência:** acima de cada resposta aparecem as ações do agent ("consultou seus
chamados", "classificou a prioridade") e o botão **Por quê?** abre o que ele entendeu, o que fez e com que
resultado, a confiança (alta/média/baixa e o motivo), a regra do service desk aplicada e o que considerou e
descartou. Tudo vem de um registro estruturado por turno (`DecisionTrace`), não do texto da resposta — o
mesmo registro alimenta o console, inclusive o filtro de conversas em que o agent não teve segurança.

## Como rodar

Pré-requisitos: Node 22+, pnpm 10, um projeto no [Neon](https://neon.tech) com dois bancos
(`nexo_app` e `nexo_tickets`) e uma chave gratuita do [Google AI Studio](https://aistudio.google.com).

```bash
pnpm install
pnpm setup:env      # cria apps/web/.env.local e apps/tickets/.env.local com os segredos gerados
```

Cole nos `.env.local` as connection strings do Neon (pooled e direta de cada banco) e a
`GOOGLE_GENERATIVE_AI_API_KEY`. Depois:

```bash
pnpm --filter @nexo/db db:check && pnpm --filter @nexo/tickets db:check   # confere as conexões
pnpm --filter @nexo/db db:migrate
pnpm --filter @nexo/tickets db:migrate
pnpm --filter @nexo/tickets db:seed      # dados de exemplo (apaga e recria o banco de chamados)
pnpm dev                                 # web em :3000, serviço de chamados em :3001
```

Entre em http://localhost:3000 com qualquer senha:

| Quem | E-mail | Para ver |
|---|---|---|
| Ana Souza (funcionária) | `ana.souza@nexo.com.br` | 3 chamados abertos, um vencido (INC-20311) e um resolvido reabrível |
| Carla, Bruno, Diego, Fábio | `carla.mendes@…`, `bruno.tavares@…` | chamados de outras pessoas (isolamento) |
| Gabriela Rocha | `gabriela.rocha@nexo.com.br` | funcionária sem chamados |
| Rafael Lima (analista N2) | `rafael.lima@nexo.com.br` | console do analista |
| Juliana Costa (analista N1) | `juliana.costa@nexo.com.br` | console do analista |

Roteiro curto: como Ana, pergunte "como está meu chamado do notebook?" → o agent mostra que está vencido e
oferece um analista → abra o **Por quê?** → aceite → entre como Rafael, assuma, responda e devolva ao agent.

## Arquitetura

```
apps/web                 Next.js: telas (login, chat, console) e Route Handlers (auth, conversas, SSE).
apps/tickets             Serviço de chamados simulado ("legado"): API própria, banco próprio, falhas
                         ocasionais configuráveis. Hospeda também a central de ajuda.
packages/agent           Agent (Mastra): prompt, ferramentas, regras em código e DecisionTrace.
packages/tickets-client  Cliente do legado: timeout, retry com backoff, idempotência; nunca lança.
packages/db              Banco da aplicação: sessões, conversas, mensagens, traces.
packages/shared          Contratos zod entre as camadas e regras puras do service desk (prazos).
```

O agent não acessa banco nem rede diretamente: recebe o cliente do serviço de chamados injetado, sempre com
o id do funcionário da sessão — nunca um id vindo do texto. As regras que não podem depender do modelo ficam
em código: confirmação em mensagem posterior antes de criar/atualizar, trava de duplicidade, janela de 7 dias
para reabrir, prazos em horário útil, transferência automática por baixa confiança ou caso crítico, agent mudo
enquanto a conversa está com analista e limite de 30 mensagens por sessão.

Decisões justificadas em [`docs/adr/`](docs/adr):
[0001 camadas](docs/adr/0001-monorepo-e-camadas.md) ·
[0002 dados](docs/adr/0002-dados-neon-drizzle.md) ·
[0003 prazos](docs/adr/0003-prazos-em-horario-util.md) ·
[0004 agent e LLM](docs/adr/0004-agent-mastra-e-llm-gratuito.md) ·
[0005 ícones](docs/adr/0005-icones-lucide.md).
Regras do service desk em [`docs/anexos/A-regras-service-desk.md`](docs/anexos/A-regras-service-desk.md);
specs de design em [`docs/design/`](docs/design).

## Custo e desempenho

O padrão é gratuito: uma cadeia de modelos Gemini Flash (`AGENT_MODEL`), que passa para o próximo quando um
atinge o limite do plano. O prefixo do prompt (instruções e ferramentas) é estável e o histórico só cresce,
o que favorece o cache do provedor; os tokens de cada turno ficam no `DecisionTrace`. Nos evals, um turno
usa em média ~14 mil tokens de entrada.

## Deploy (Vercel)

Dois projetos Vercel apontando para o mesmo repositório, com **Root Directory** `apps/web` e `apps/tickets`.
As funções ficam em `cle1` (Ohio, `vercel.json` de cada app), perto do Neon em us-east-2. Configure as
variáveis de cada `.env.local` no projeto correspondente; no web, `TICKETS_SERVICE_URL` passa a ser a URL do
projeto de chamados, com a mesma `TICKETS_SERVICE_KEY` nos dois. Rode as migrações e o seed contra o banco de
produção antes do primeiro acesso.

## Testes

```bash
pnpm lint && pnpm typecheck && pnpm test   # unidade e integração (PGlite, sem rede nem LLM)
pnpm --filter @nexo/agent eval             # agent com o modelo real, corrigido por código
pnpm --filter @nexo/web e2e                # Playwright nos dois serviços, bancos e modelo reais
```

Os testes cobrem onde faz diferença: prazos e vencimento, duplicidade e reabertura, isolamento entre
funcionários, pausa do agent, retry e idempotência do legado, limite de mensagens e concorrência entre
analistas. Evals e e2e chamam o LLM e por isso ficam fora do `pnpm test`.

## Segurança e privacidade

- Chaves só em variáveis de ambiente (`.env.local` fora do git; `.env.example` documenta).
- Toda leitura de chamado e conversa exige o id do funcionário da sessão, no servidor; testes tentam ler
  dados de outra pessoa e precisam falhar.
- Sessão em cookie `httpOnly` assinado e conferida no banco; o id da sessão nunca chega ao navegador.
- O serviço de chamados exige uma chave de serviço; a interface não importa código de servidor (lint).
