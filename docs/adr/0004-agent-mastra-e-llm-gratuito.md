# 0004 — Agent com Mastra e LLM gratuito (Gemini) por padrão

- Status: aceita
- Data: 2026-11-01

## Contexto
O projeto é um teste técnico e deve ter custo zero de LLM. O agent precisa de tool use confiável,
streaming e português bom. Foi pedido o uso do Mastra como framework de agent.

## Decisão
- **Mastra** (`@mastra/core`) conduz o loop de ferramentas (`Agent` + `createTool`). As ferramentas
  só delegam para o turno em andamento via `RequestContext`; as regras do Anexo A continuam em código
  (`packages/agent/src/run-turn.ts`): rascunho + confirmação, trava de duplicidade, transferência
  automática, honestidade quando o legado cai. Isso mantém o comportamento independente do modelo.
- **Modelo por variável de ambiente** no formato `provedor/modelo` do model router do Mastra.
  Padrão: `google/gemini-2.5-flash` no plano gratuito do Google AI Studio (sem cartão, tool calling
  confiável, bom português). Alternativas sem custo: Groq (`groq/openai/gpt-oss-120b`), OpenRouter
  (`openrouter/<modelo>:free`) e Ollama local (`AGENT_MODEL_URL`). Com chave paga, qualquer outro
  provedor suportado (ex.: `anthropic/claude-haiku-5-5`) funciona sem mudar código.
- **Histórico só anexado** (nunca reescrito), o que aproveita o cache implícito de prefixo dos provedores.

## Alternativas consideradas
- SDK da Anthropic direto (implementação anterior): melhor controle de cache e fallback de recusa,
  mas exige chave paga.
- Modo demonstração sem LLM: custo zero, mas não entende linguagem livre.

## Consequências
- Plano gratuito tem limite por minuto e por dia (centenas de requisições/dia no Gemini Flash; cada
  mensagem do chat usa ~2–4 chamadas). Erro do provedor vira resposta honesta + transferência ao analista.
- No plano gratuito o Google pode usar os dados para melhorar produtos; aqui todos os dados são fictícios.
- Os evals (`pnpm --filter @nexo/agent eval`) rodam sem custo, com pausa entre casos para respeitar o limite.
