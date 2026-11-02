# Transparência das decisões — chips de ação e detalhe da decisão

A parte mais importante do produto. Toda mensagem do agent é acompanhada do que ele **fez** (chips) e, sob demanda,
de **por que** fez (detalhe). Tudo é renderizado a partir do `DecisionTrace` (`packages/shared/src/trace.ts`) e dos
`blocks` da mensagem — **nunca** do texto livre da resposta.

Componentes:
- `ActionChips` — camada 1, sempre visível acima da resposta.
- `DecisionDetails` — camada 2, expansível. Variante `employee` (chat, enxuta) e `analyst` (console, completa).
- `ConfidenceMeter` — usado no detalhe e no badge do console.
- `chipText(action, trace, blocks)` e os dicionários de §5 — funções puras em `apps/web` (ou em `packages/shared/labels.ts`
  se o backend também precisar). Testar com Vitest.

---

## 1. Camada 1 — chips de ação

Referência visual: "Status Line" das Telas 2 e 3 (`Nexo Assist ✓ consultou seus chamados ✓ buscou na central de ajuda`).

### Anatomia
```
Nexo Assist   ✓ consultou seus chamados   ✓ buscou na central de ajuda   ⚠ não conseguiu consultar o INC-20311 · 3 tentativas   Por quê? ˅
```
- Linha `flex flex-wrap items-center gap-x-3 gap-y-1` (gap 12px do protótipo).
- **Quem**: "Nexo Assist" `text-meta font-semibold text-ink`.
- **Chip**: `inline-flex items-center gap-1.25` (5px), ícone 12px + rótulo `text-meta text-muted`. Sem fundo nem borda
  (como no protótipo) — são registros, não botões.
- **Toggle "Por quê?"**: último item da linha; `inline-flex items-center gap-1 text-meta font-medium text-primary-ink`
  + `chevron-down` 12px (gira 180° aberto). Alvo de toque mínimo 24px (`py-1 -my-1`). Só aparece quando há trace.

### Estados de um chip

| `outcome` da ação | Ícone (12px) | Cor do rótulo | Exemplo |
|---|---|---|---|
| `ok` | `check` `text-muted` | `text-muted` | "consultou seus chamados" |
| `sem_resultado` | `minus` `text-muted` | `text-muted` | "buscou na central de ajuda · nada encontrado" |
| `erro` | `triangle-alert` `text-danger-ink` | `text-danger-ink` | "não conseguiu consultar seus chamados" |
| `attempts > 1` (qualquer outcome) | — | sufixo `· 3 tentativas` em `text-muted` (ou `danger-ink` se erro) | "consultou seus chamados · 2 tentativas" |
| em andamento (streaming) | spinner 12px (`loader-circle` girando) | `text-muted` | "trabalhando…" |

O sentido nunca depende só da cor: o texto do erro começa com "não conseguiu" e o ícone muda de forma.

### Ordem e chips derivados
Chips = ações do trace, na ordem em que aconteceram, mais **chips derivados** dos blocos/resultado (o protótipo mostra
"classificou a prioridade" e "consultou o SLA", que não são ferramentas). Regras:

| Condição | Chip derivado | Posição |
|---|---|---|
| bloco `draft` presente | "classificou a prioridade como {Alta}" e "calculou o prazo" | imediatamente antes do chip de `propose_new_ticket` |
| bloco `update_draft` com `newPriority` | "reclassificou a prioridade como {Alta}" | antes do chip de `propose_ticket_update` |
| bloco `ticket_cards` com chamado aberto e `dueAt` | "calculou o prazo" | depois do chip de `get_ticket`/`list_my_tickets` |
| `trace.outcome = redirecionou` | "viu que o assunto não é de TI" | último |
| `trace.intent = conversa` e sem ações | nenhum chip; só "Nexo Assist" + "Por quê?" | — |

Derivados sempre têm estado `ok`. No máximo **5 chips visíveis** na linha; excedentes viram "+2" (`text-meta text-muted`,
botão que abre o detalhe). **[decisão]**

### Texto do chip por ferramenta (`chipText`)
O `label` do trace é usado para `ok`; os demais estados e os que precisam do id do chamado são montados aqui.
`{id}` = `inputSummary` (ou o primeiro `INC-\d+|REQ-\d+` dele / do `resultSummary`).

| Ferramenta | `ok` | `sem_resultado` | `erro` |
|---|---|---|---|
| `search_help_center` | buscou na central de ajuda | buscou na central de ajuda · nada encontrado | não conseguiu buscar na central de ajuda |
| `list_my_tickets` | consultou seus chamados | consultou seus chamados · nenhum encontrado | não conseguiu consultar seus chamados |
| `get_ticket` | consultou o {id} | não encontrou o {id} entre os seus chamados | não conseguiu consultar o {id} |
| `propose_new_ticket` | montou o rascunho do chamado | encontrou chamados parecidos | não conseguiu montar o rascunho |
| `propose_ticket_update` | montou a atualização do {id} | — | não conseguiu montar a atualização |
| `confirm_pending_action` | conforme `trace.outcome`: criou o chamado {id} · atualizou o {id} · reabriu o {id} | — | não conseguiu registrar no sistema de chamados |
| `transfer_to_analyst` | chamou um analista | — | não conseguiu chamar um analista |

> Recomendação ao backend: trocar `ACTION_LABELS.get_ticket` de "abriu o chamado" para "consultou o chamado" —
> "abriu" soa como "abriu um chamado novo". A UI já não depende disso (usa a tabela acima).

### Streaming (eventos `ChatStreamEvent`)
1. `saved` → aparece a linha "Nexo Assist" com o chip "trabalhando…" (spinner).
2. cada `action` → o chip correspondente entra **antes** de "trabalhando…" com `animate-chip-in`.
3. primeiro `text` → "trabalhando…" some; o texto entra na bolha com cursor (`▍` 2px `bg-ink animate-caret`).
4. `done` → cursor some, chips são recalculados a partir do `trace` final (inclui derivados), blocos aparecem, "Por quê?" aparece.
5. `error` → ver `chat.md` §Erros; chips já recebidos permanecem.

---

## 2. Camada 2 — detalhe da decisão

Aberto pelo "Por quê?". Painel logo **abaixo da linha de chips** e acima da bolha (fica junto do gatilho; a resposta
desce). Fechado por padrão no chat; no console, aberto por padrão quando a confiança é baixa.

### Anatomia comum
```
┌ O que entendi ─────────────────────────────────────────────┐
│ Você quer abrir um chamado: a VPN não conecta (erro 809)…   │
│ O que fiz                                                   │
│ ✓ consultou seus chamados — nenhum sobre VPN                │
│ ✓ buscou na central de ajuda — artigo só vale p/ Windows 10 │
│ → Resultado: montei um rascunho para você conferir.         │
│   Nada foi criado ainda.                                    │
│ Segurança                                                   │
│ ▮▮▮  Alta · Erro e sistema claros, sem chamado parecido.    │
│ Por quê                                                     │
│ A reunião às 14h é um compromisso no mesmo dia…             │
│ [§ Prioridade e prazo] Impede uma pessoa de trabalhar e…    │
│ O que considerei e não fiz                                  │
│ • Não complementei o INC-20298: é outro problema (acesso).  │
└─────────────────────────────────────────────────────────────┘
```
- Contêiner: `w-full max-w-bubble-agent` (chat) / `max-w-[560px]` (console), `p-4 rounded-bubble bg-surface-subtle
  outline-1 -outline-offset-1 outline-border-subtle flex flex-col gap-3.5`.
- Título de seção: `h4` `text-meta font-semibold text-muted` (sentence case, sem caixa alta). Corpo: `text-ui text-ink`
  (`text-ui` = 13.5/20). Seções vazias são omitidas (exceto onde indicado no console).

### Seções

**1. O que entendi** — `trace.understanding` (uma frase). No console, antes da frase: pílula da intenção
`px-2 py-0.5 rounded-full bg-surface text-micro font-medium text-ink-secondary outline-1 outline-border-subtle`
com o texto de `INTENT_LABELS` (§5).

**2. O que fiz** — `ul` `flex flex-col gap-1.5`; uma linha por ação: ícone 14px do estado + `chipText` em `text-ink`
+ " — " + resumo do resultado em `text-ink-secondary`:
- funcionário: resumo humano (`humanResult`, §5) — **nunca** mostrar `resultSummary` cru (pode conter ids internos
  como o da proposta).
- console: `resultSummary` cru, e abaixo `text-micro text-muted tabular-nums`: "Entrada: {inputSummary} · {0,8 s} · {n} tentativas".
  Tentativas > 1 em `warning-ink` com ícone `rotate-cw` 12px; erro em `danger-ink`.
Depois da lista, a linha de **resultado do turno**: `flex gap-2`, ícone `arrow-right` 14px `text-muted`,
`text-ui font-medium text-ink` com `OUTCOME_LABELS[trace.outcome]` (§5). Se não houve ações: só a linha de resultado.

**3. Segurança** — `ConfidenceMeter` + rótulo + motivo:
- Medidor: 3 segmentos `w-5 h-1.5 rounded-full gap-0.75` (20×6px, 3px de espaço); cheios conforme o nível
  (alta 3, média 2, baixa 1) na cor `confianca-{nível}`; vazios `meter-track`. `aria-hidden` (o texto ao lado diz tudo).
- Rótulo: `text-ui font-semibold text-confianca-{nível}-ink` — "Alta" / "Média" / "Baixa".
- Console acrescenta o número: "Baixa · 41%" (`tabular-nums`) e, se baixa, a linha `text-micro text-muted`:
  "Abaixo de 60% o caso vai automaticamente para um analista (Anexo A, transferência)."
- Motivo: `confidence.reason` em `text-ui text-ink-secondary`, precedido da frase do nível (§5, `CONFIDENCE_COPY`).

**4. Por quê** — `trace.rationale` (`text-ui text-ink`) e, abaixo, `rulesApplied` em `ul gap-2`; cada regra:
- Etiqueta `inline-flex items-center gap-1 px-1.5 py-0.5 rounded-tag bg-surface outline-1 outline-border-subtle
  text-micro font-medium text-ink-secondary`, ícone `book-open` 12px, texto `RULE_LABELS[rule]`.
- Ao lado/abaixo: `explanation` do trace em `text-ui text-ink-secondary`.
- Console: terceira linha `text-micro text-muted` com o resumo da regra do Anexo A (`RULE_SOURCE`, §5).

**5. O que considerei e não fiz** — `alternativesDiscarded` como `ul list-disc pl-4 text-ui text-ink-secondary`.
Chat: omitida se vazia. Console: se vazia, "Nada descartado neste turno." em `text-muted`.

**6. Rodapé técnico** — **só no console**: `border-t border-border-subtle pt-2.5 text-micro text-muted tabular-nums`:
"{model} · {inputTokens} tokens de entrada ({cacheReadTokens} do cache) · {outputTokens} de saída · {latência} s".
Números com separador pt-BR (`Intl.NumberFormat('pt-BR')`), latência com 1 casa ("2,4 s").

### Variante do funcionário (chat) — enxuta
Seções 1 a 5, linguagem em 1ª pessoa ("entendi", "fiz"), sem números de confiança, sem entradas/durações/tokens,
resultados humanizados. Objetivo: o funcionário entende em 10 segundos o que aconteceu e o que está pendente.

### Variante do analista (console) — completa
Tudo da variante do funcionário + pílula de intenção, número da confiança e limiar, entradas/durações/tentativas,
`resultSummary` cru, resumo da regra do Anexo A, "nada descartado" explícito e rodapé técnico. Textos em 3ª pessoa
("O agent entendeu", "fez") — ver títulos em §5.

**Destaque de baixa confiança no console:**
- Linha do remetente da mensagem do agent ganha o badge `ConfidenceBadge` (só para média e baixa):
  `inline-flex items-center gap-1 px-1.5 py-px rounded-tag text-tiny font-semibold`, ícone 12px
  (`triangle-alert` baixa / `circle-help` média), "Confiança baixa · 41%" (`bg-confianca-baixa-tint text-confianca-baixa-ink`)
  ou "Confiança média · 72%" (tint/ink média). Alta: sem badge (evita ruído; está no detalhe).
- Baixa: painel **aberto por padrão** e com barra de destaque `border-l-3 border-confianca-baixa` (o restante do contorno
  igual). Média: fechado, só o badge.
- A lista de conversas mostra "Agent pediu ajuda · confiança baixa, 41%" (ver `console.md`).

---

## 3. Estados do componente

| Estado | Comportamento |
|---|---|
| Sem trace (`traceId` nulo ou ausente em `traces`) | sem "Por quê?"; chips não aparecem (mensagem antiga/sistema). |
| Streaming | "Por quê?" escondido até `done`. |
| Turno com falha (`outcome = falhou`) | chips de erro + detalhe normal; "O que fiz" deixa claro "nada foi registrado". |
| Agent pausado | traces antigos continuam abríveis; nenhuma mensagem nova do agent. |
| Texto longo | sem truncar no detalhe; o painel cresce. Nos chips, rótulo nunca quebra no meio (`whitespace-nowrap`), a linha quebra entre chips. |
| Mobile 375px | painel `w-full`, `p-3.5`; chips quebram em várias linhas; "+N" a partir de 3 chips visíveis. |

## 4. Acessibilidade

- Cada mensagem do agent é um `article` com `aria-labelledby` no nome "Nexo Assist" + hora.
- Chips: `ul` com `aria-label="O que o assistente fez"`; cada `li` tem o texto completo (o ícone é `aria-hidden`; o estado
  de erro já está no texto). O "+N" é `button` com `aria-label="Mostrar mais 2 ações"`.
- "Por quê?": `button` com `aria-expanded` e `aria-controls`; `aria-label="Por que o assistente respondeu assim"`.
  Painel: `role="region"` + `aria-labelledby` do botão; seções com `h4`.
- Durante o streaming, `aria-live="polite"` em uma região invisível anuncia cada chip ao chegar ("O assistente consultou
  seus chamados") e, no `done`, "Nexo Assist respondeu." — o texto da resposta não é anunciado em pedaços.
- Badge de confiança: texto completo legível ("Confiança baixa, 41 por cento"); medidor `aria-hidden`.
- Foco: abrir o painel não move o foco; fechar devolve ao botão.

---

## 5. Microcopy (pt-BR) — dicionários

### `INTENT_LABELS` (pílula no console; usado também no texto do funcionário quando útil)

| Intent | Rótulo |
|---|---|
| `duvida` | Tirar uma dúvida |
| `consultar_chamado` | Ver como está um chamado |
| `complementar_chamado` | Complementar um chamado |
| `abrir_chamado` | Abrir um chamado |
| `confirmar_rascunho` | Confirmar o rascunho |
| `falar_com_analista` | Falar com um analista |
| `fora_de_escopo` | Assunto fora de TI |
| `conversa` | Conversa (cumprimento ou agradecimento) |

### `OUTCOME_LABELS` (linha "Resultado")

| Outcome | Funcionário (1ª pessoa) | Console (3ª pessoa) |
|---|---|---|
| `respondeu` | Respondi sua dúvida, sem abrir chamado. | Respondeu sem abrir chamado. |
| `pediu_informacao` | Pedi mais uma informação para seguir. | Pediu mais informação. |
| `propos_rascunho` | Montei um rascunho para você conferir. Nada foi criado ainda. | Propôs rascunho — aguardando confirmação do funcionário. |
| `criou_chamado` | Criei o chamado {id}. | Criou o chamado {id}. |
| `atualizou_chamado` | Acrescentei a informação ao {id}. | Atualizou o {id}. |
| `reabriu_chamado` | Reabri o {id}. | Reabriu o {id}. |
| `transferiu` | Chamei um analista. Ele continua a conversa por aqui. | Transferiu para um analista. |
| `redirecionou` | Indiquei o caminho certo: esse assunto não é de TI. | Redirecionou: assunto fora de TI. |
| `falhou` | Não consegui concluir. Nada foi criado nem alterado. | Falhou — nada foi registrado no sistema de chamados. |

`{id}` vem do bloco `ticket_cards` da mesma mensagem ou do `resultSummary` de `confirm_pending_action`.

### `humanResult` (resumo humano por ação, só no chat)

| Ferramenta / outcome | Texto |
|---|---|
| `search_help_center` ok | encontrei artigos sobre isso |
| `search_help_center` sem_resultado | não há artigo sobre isso |
| `list_my_tickets` ok | encontrei {n} chamado(s) seu(s) (`n` = ids no `resultSummary` separados por vírgula) |
| `list_my_tickets` sem_resultado | você não tem chamados nesse filtro |
| `get_ticket` ok | vi o status e o prazo |
| `get_ticket` sem_resultado | esse chamado não está entre os seus (por privacidade, só mostro chamados que você abriu) |
| `propose_new_ticket` ok | rascunho pronto, esperando sua confirmação |
| `propose_new_ticket` sem_resultado | você já tem chamados parecidos; conferi antes de abrir outro |
| `propose_ticket_update` ok | proposta pronta, esperando sua confirmação |
| `confirm_pending_action` ok | registrado no sistema de chamados |
| `transfer_to_analyst` ok | o caso foi para a fila dos analistas, com um resumo |
| qualquer `erro` | o sistema de chamados não respondeu{ (n tentativas)} |

### `CONFIDENCE_COPY`

| Nível | Funcionário | Console |
|---|---|---|
| alta | Alta — estou seguro do que fiz. | Alta |
| media | Média — vale conferir os detalhes. | Média |
| baixa | Baixa — por isso chamei um analista. | Baixa — transferência automática |

Seguido de `confidence.reason`.

### Títulos das seções

| Seção | Chat | Console |
|---|---|---|
| 1 | O que entendi | O que o agent entendeu |
| 2 | O que fiz | O que o agent fez |
| 3 | Segurança | Segurança |
| 4 | Por quê | Por quê |
| 5 | O que considerei e não fiz | O que considerou e não fez |
| 6 | — | Detalhes técnicos |

### `RULE_LABELS` e `RULE_SOURCE` (Anexo A)

| Regra | Etiqueta | Resumo do Anexo A (console) |
|---|---|---|
| `tipo` | Tipo do chamado | Incidente: algo parou ou não funciona. Requisição: pedido de acesso, equipamento ou software. |
| `categoria` | Categoria | Acesso, Rede e VPN, Hardware, Software, E-mail ou Outros. |
| `abertura` | Abertura com confirmação | Todo chamado tem título, descrição, tipo, categoria, prioridade e quem é afetado, e só é criado ou atualizado depois da confirmação do funcionário. |
| `duplicidade` | Sem duplicidade | Se já existe chamado aberto sobre o mesmo problema, ele é atualizado, não duplicado. |
| `reabertura` | Reabertura | Chamados resolvidos há até 7 dias podem ser reabertos. |
| `transferencia` | Transferência para analista | Quando o funcionário pede, o caso é crítico, o chamado está vencido ou o agent não tem segurança. Vai com resumo; o agent não responde enquanto o analista atende. |
| `privacidade` | Privacidade | Informações de um chamado só são passadas a quem o abriu. |
| `escopo` | Só assuntos de TI | RH, financeiro e facilities são redirecionados, sem abrir chamado. |
| `prioridade` | Prioridade e prazo | Impacto (quantos são afetados) + urgência (compromisso em risco). Crítica 1 h · Alta 4 h úteis · Média 3 dias úteis · Baixa 5 dias úteis. Prazo vale para a primeira resposta e para cada atualização. |

---

## 6. Exemplos completos (para conferir a implementação)

**Tela 2, 2º turno — rascunho (chat):**
Chips: ✓ classificou a prioridade como Alta · ✓ calculou o prazo · ✓ montou o rascunho do chamado · Por quê?
- O que entendi: "Só você está sem VPN e precisa dela para uma reunião com cliente às 14h."
- O que fiz: ✓ montou o rascunho do chamado — rascunho pronto, esperando sua confirmação. → Montei um rascunho para você conferir. Nada foi criado ainda.
- Segurança: ▮▮▮ Alta — estou seguro do que fiz. Problema e impacto descritos com clareza.
- Por quê: "Coloquei Alta porque há um compromisso hoje." [§ Prioridade e prazo] Impede uma pessoa de trabalhar e há compromisso no mesmo dia → 4 horas úteis.

**Tela 3 — chamado vencido (console):**
Sender: Nexo Assist [IA] · badge ausente (alta).
- O que o agent entendeu: [Ver como está um chamado] "Quer saber do INC-20311 (notebook lento)."
- O que o agent fez: ✓ consultou o INC-20311 — "aguardando_analista, prioridade media" / Entrada: INC-20311 · 0,6 s · 1 tentativa.
  ✓ calculou o prazo. → Respondeu sem abrir chamado.
- Por quê: "Sem atualização há 5 dias, acima de 3 dias úteis." [§ Prioridade e prazo] … [§ Transferência para analista] chamado vencido: ofereceu analista.

**Baixa confiança (console):** badge "Confiança baixa · 41%", painel aberto com barra vermelha à esquerda,
"Baixa · 41% — transferência automática", linha do limiar, resultado "Transferiu para um analista."
