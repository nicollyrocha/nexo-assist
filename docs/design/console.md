# Telas 4 e 5 — Console do analista

Referências: `tela-4-console-conversas.{png,html}` (lista, conversa aguardando atendente, agent pausado, chamados do
funcionário) e `tela-5-console-atendimento.{png,html}` (analista assumiu; devolver/encerrar; composer ativo). Rota `/console`
(e `/console/[id]` com a conversa aberta). Tokens: `tokens.md`. Detalhe da decisão: `decision-trace.md` (variante `analyst`).

Dados: `GET /api/console/conversations?filter&q` → `ConsoleList`; `GET /api/console/conversations/:id` → `ConsoleConversation`;
`POST …/:id/claim | return | close` (body `{ version }`, 409 `conflict`); `POST …/:id/messages`.
Polling **[decisão]**: lista a cada 5 s; conversa aberta a cada 3 s.

---

## 1. Layout (1440 × 900)

```
┌Rail 64┬── Lista 380 ──────────┬──────── Conversa (flex-1, bg-surface-thread) ────────┬─ Chamados 340 ─┐
│ [N]   │ Conversas (●Disponível)│ (AS) Ana Souza            (🤖 Aguardando atendente) ⋮│ Chamados da Ana │
│ [💬5] │ [🔍 Pesquisar…]        ├──────────────────────────────────────────────────────┤ 3 abertos · 2…  │
│       │ Todas  Para você 3 …   │                 (Hoje)                               │ Desta conversa  │
│       │ ┌ item selecionado ┐   │ [funcionário]                                        │ ┌ card ──────┐  │
│       │ │(AS) Ana   10:05  │   │                      Nexo Assist IA ✓chip Por quê?   │ └────────────┘  │
│       │ │ texto…           │   │                                     [agent]          │ Outros chamados │
│       │ │ ● Transferida…   │   │ ──── ⇄ Transferida para um analista · 10:05 ────     │ • …           › │
│       │ └──────────────────┘   │ [Resumo do caso]                                     │                 │
│       │ …                      ├──────────────────────────────────────────────────────┤                 │
│ (RL)  │                        │ (✋) Ana espera um atendente  [Devolver] [Assumir]   │ [Ver todos…]    │
│       │                        │ [ Assuma o atendimento para responder ]              │                 │
└───────┴────────────────────────┴──────────────────────────────────────────────────────┴─────────────────┘
```
Tela 5 tem 1567px no protótipo só porque a conversa é mais larga; a conversa é `flex-1`, nada muda além da largura.

---

## 2. Rail (`nav`, `w-rail bg-surface-subtle border-r border-border-subtle py-4 gap-1.5 flex flex-col items-center`)
- Logo `size-10 pb-2`: símbolo 22px `fill-brand-mark`.
- "Conversas" (ativo): `size-10 rounded-bubble bg-surface drop-shadow-rail`, ícone `message-circle` 19px `text-ink`; badge
  `absolute left-6 top-1 h-4 px-1.25 rounded-full bg-primary outline-2 outline-surface-subtle text-badge font-bold text-white`
  com `counts.para_voce` (oculto se 0; "99+" acima de 99). `aria-label="Conversas, 5 precisam de você"`.
- Espaçador; "Eu": avatar 36px `bg-primary-tint` iniciais `text-meta font-bold text-primary-ink`, ponto 10px `bg-success
  outline-2 outline-surface-subtle` em `left-6.5 top-6.5`. Clique abre menu (`shadow-popover`): nome, "Suporte N2", "Sair".

## 3. Lista de conversas (`w-conv-list border-r border-border-subtle flex flex-col`)

### Cabeçalho (`pt-4 px-4 pb-2.5 gap-3`)
- Linha título: `h1` "Conversas" `text-heading font-bold text-ink flex-1` + pílula "Disponível" (`py-1.25 px-2.5 gap-1.5
  rounded-full bg-success-tint`, ponto 7px `bg-success`, `text-meta font-semibold text-success-ink`). **[decisão]** pílula
  informativa (não há controle de disponibilidade no escopo).
- Busca: `h-9 px-3 gap-2.5 rounded-full bg-surface-subtle`, ícone `search` 15px `text-muted`, `input type="search"`
  `text-ui text-ink` placeholder "Pesquisar conversa ou chamado". Debounce 300 ms → `q`. Com texto, botão `x` 14px "Limpar busca".
- Filtros (`role="tablist"`, `gap-1`): pílula `py-1.5 px-2.25 gap-1.5 rounded-full`:
  - inativo `bg-surface-subtle`, rótulo `text-meta font-medium text-ink-secondary`, contagem `text-meta font-semibold text-muted`.
  - ativo `bg-primary-tint`, rótulo e contagem `text-primary-ink`; `aria-selected="true"`.
  - "Todas" (sem contagem, como no protótipo) · "Para você {n}" · "Com o agent {n}" · "Minhas {n}". Padrão: **Para você**.
  - Contagens de `counts`; 0 aparece como "0" em `text-muted`.

### Item (`ConversationItem`, `button` dentro de `li`; lista `px-2`, rola)
- `w-full p-2.5 gap-3 flex items-center rounded-bubble text-left`; hover `bg-surface-subtle`; selecionado `bg-surface-subtle`
  + `aria-current="true"`.
- Avatar 46px `rounded-full` com cor da tabela de avatares (`tokens.md`), iniciais `text-body-lg font-semibold`.
  **[decisão]** sem ponto "online" (não há dado de presença).
- Texto `flex-1 min-w-0 gap-0.75 pb-2.5 border-b border-border-subtle` (sem borda no selecionado e no seguinte a ele, e no último):
  - Topo `gap-2`: nome `text-body-lg text-ink truncate flex-1` (**semibold** se `aguardando_atendente`, senão medium) + hora
    `text-meta tabular-nums` (`text-primary font-semibold` se `aguardando_atendente`; senão `text-muted`). Hora: "10:05" hoje,
    "ontem", "28 out".
  - Prévia `text-ui text-muted truncate`: prefixo conforme `lastMessageRole` — agent "Nexo: ", analista "Você: " (se `assignedAnalystId`
    = eu) ou "{Primeiro nome do analista}: ", sistema em itálico sem prefixo, funcionário sem prefixo.
    **[decisão]** sem contador de não lidas, "digitando…" nem ✓✓ (não há esses dados no contrato).
  - Tag de estado `gap-1.25 flex items-center`: ponto 6px + `text-micro font-medium`:

| Situação | Ponto | Texto | Cor do texto |
|---|---|---|---|
| `aguardando_atendente` + `pedido_do_funcionario` | `danger` | Transferida · pediu um analista · espera há 7 min | `danger-ink` |
| `aguardando_atendente` + `caso_critico` | `danger` | Transferida · caso crítico · espera há 7 min | `danger-ink` |
| `aguardando_atendente` + `chamado_vencido` | `danger` | Transferida · chamado vencido · espera há 7 min | `danger-ink` |
| `aguardando_atendente` + `baixa_confianca` | `warning` | Agent pediu ajuda · confiança baixa, 41% · espera há 7 min | `warning-ink` |
| `em_atendimento` comigo | `primary` | Você está atendendo | `primary-ink` |
| `em_atendimento` com outro | `accent` | Com {Rafael Lima} | `muted` |
| `ativa` | `success` | Agent atendendo | `muted` |
| `ativa` com `minConfidence` média | `success` | Agent atendendo · confiança média | `muted` |
| `encerrada` sem analista | `status-encerrado` | Resolvida pelo agent | `muted` |
| `encerrada` com analista | `status-encerrado` | Encerrada por {nome} | `muted` |

  "espera há X" usa `waitingSince` ("há 1 min", "há 25 min", "há 2 h"); acima de 30 min o trecho fica `font-semibold`
  **[decisão]**. Confiança: `Math.round(minConfidence*100)`. Texto completo também em `title`.
  Ordem **[decisão, pedir ao backend]**: "Para você" por `waitingSince` mais antigo primeiro; demais por `lastMessageAt` desc.

### Estados da lista
| Estado | Visual / texto |
|---|---|
| Carregando | 6 itens esqueleto (círculo 46 + 2 barras) `animate-pulse`. |
| Vazio "Para você" | ícone `inbox` 24px `text-muted`, "Ninguém esperando por você agora." / "Quando o agent transferir uma conversa, ela aparece aqui." |
| Vazio "Minhas" | "Você não está atendendo nenhuma conversa." |
| Vazio "Com o agent" | "Nenhuma conversa com o agent neste momento." |
| Vazio "Todas" | "Ainda não há conversas." |
| Busca sem resultado | "Nada encontrado para “{q}”." + botão "Limpar busca". |
| Erro | `triangle-alert` 20px `text-warning-ink`, "Não consegui atualizar a lista." + "Tentar de novo"; se já havia dados, mantém a lista e mostra só uma faixa `bg-warning-tint text-meta text-warning-ink` no topo: "Lista desatualizada — tentando de novo…". |
| Nova conversa "Para você" chega | entra no topo com fundo `bg-warning-tint` que some em 2 s; anúncio `aria-live="polite"`: "Nova conversa esperando atendimento: {nome}". |

---

## 4. Conversa aberta (`flex-1 flex flex-col bg-surface-thread`)

### Sem conversa selecionada
Centro: ícone `messages-square` 28px `text-muted`, "Escolha uma conversa" `text-body font-semibold`, "As que precisam de você
estão em Para você." `text-ui text-muted`.

### Cabeçalho (`h-topbar pl-5 pr-4 gap-3 bg-surface border-b border-border-subtle flex items-center`)
- Avatar 40px (cor da tabela) iniciais `text-body font-semibold`.
- Quem `flex-1 gap-0.5`: nome `text-body-lg font-semibold`; meta `text-meta text-muted`: "{departamento} · {ticketId}"
  **[decisão: sem "online"]**.
- Pílula de modo `py-1.5 px-2.75 gap-1.75 rounded-full text-meta font-semibold`:
  | Status | Ícone 14px | Texto | Cores |
  |---|---|---|---|
  | `aguardando_atendente` | `bot` | Aguardando atendente | `bg-warning-tint text-warning-ink` (protótipo) |
  | `ativa` | `bot` | Com o agent | `bg-primary-tint text-primary-ink` |
  | `em_atendimento` comigo | `headset` | Você está atendendo | `bg-success-tint text-success-ink` |
  | `em_atendimento` outro | `headset` | Com {nome} | `bg-surface-subtle text-ink-secondary` |
  | `encerrada` | `circle-check` | Encerrada | `bg-surface-subtle text-ink-secondary` |
  Na Tela 5 o protótipo troca a pílula pelos botões; **[decisão]** quando em atendimento comigo, a pílula some e ficam os botões (§4.4).
- Botão "Chamados" (`panel-right` 18px, 36px `rounded-full`) **só abaixo de 1440px** (painel em gaveta). **[decisão: o ícone
  de busca do protótipo foi trocado por este; busca dentro da conversa não está no escopo]**
- Menu `ellipsis-vertical` (36px): "Copiar resumo do caso" · "Encerrar conversa" (quando a ação está disponível e não está nos botões).

### Mensagens (`flex-1 overflow-y-auto pt-5 px-10 pb-4 flex flex-col justify-end`)
- Pílula de dia `px-2.5 py-1 rounded-full bg-day-pill text-caption font-medium text-muted`, centrada, `pb-1`: "Hoje", "Ontem", "28 out".
- **Funcionário** (esquerda): grupo `pt-4` (mensagens seguidas do mesmo autor `pt-0.75`); bolha `max-w-bubble-console
  pt-2 px-3 pb-1.5 gap-2.5 flex items-end bg-surface shadow-bubble rounded-bubble rounded-tl-tail` (seguintes `rounded-bubble`);
  texto `text-body text-ink`; hora `text-tiny text-muted tabular-nums pb-px`. Texto longo: `flex-col gap-0.5`, hora à direita.
- **Agent** (direita, `items-end gap-1`):
  - Remetente `px-1 gap-1.5 flex items-center`: "Nexo Assist" `text-caption font-semibold text-ink-secondary` + tag "IA"
    `px-1.5 py-px rounded-tag bg-primary-tint text-tiny font-semibold text-primary-ink` + `ConfidenceBadge` (média/baixa).
  - Linha de chips `ActionChips` alinhada à direita (`justify-end`) com "Por quê?" no fim. **[decisão: o protótipo não mostra
    chips no console; o briefing pede o mesmo componente com destaque para baixa confiança]**
  - `DecisionDetails` variante `analyst` (aberto por padrão se baixa).
  - Bolha `max-w-bubble-console pt-2 px-3 pb-1.5 bg-bubble-agent shadow-bubble rounded-bubble rounded-tr-tail`.
  - Blocos em versão **compacta, só leitura** **[decisão]**, `max-w-bubble-console w-full`, `rounded-bubble bg-surface
    outline-1 outline-border-subtle p-3 text-ui`:
    - `ticket_cards`: uma linha por chamado: id `text-meta font-medium text-muted` · título · ponto/status · prazo (vencido em `prazo-vencido`).
    - `ticket_selection`: "Pediu para escolher entre: INC-20311, INC-20298, REQ-10442".
    - `draft`: título + "Incidente · Rede e VPN · Alta · resposta até 13:43 · Só eu" + estado ("Aguardando confirmação" / "Criado como …").
    - `update_draft`: "Complementar INC-20311: “{comment}”" (+ "Prioridade Média → Alta" / "Reabrir").
    - `quick_replies`: `text-meta text-muted` "Opções oferecidas: Só eu · Minha equipe · A empresa toda".
- **Analista** (direita): remetente "{nome}" + tag "Suporte N2" (`bg-success-tint text-success-ink`), bolha `bg-bubble-analyst`.
  Minhas mensagens: nome "Você".
- **Sistema / event**: divisória `pt-4.5 pb-1 gap-3` (linhas `bg-divider-soft`, ícone 13px + `text-caption font-medium text-muted`):
  "Transferida para um analista · 10:05" (`arrow-right-left`), "{Rafael Lima} assumiu · agent pausado · 10:12" (`headset`),
  "Devolvida ao agent por {nome} · 10:40" (`bot`), "Encerrada por {nome} · 10:41" (`circle-check`).
- **Resumo do caso** **[decisão — Anexo A: a transferência leva um resumo; o protótipo não mostra onde]**: card logo após a
  divisória de transferência, centrado, `max-w-[560px] w-full mx-auto mt-2 p-3.5 gap-2 rounded-bubble bg-surface outline-1
  outline-border-subtle`:
  - Título `text-meta font-semibold text-muted` com ícone `file-text` 14px: "Resumo do caso para o analista".
  - Motivo `text-ui font-medium text-ink`: "Motivo: {TRANSFER_REASON_LABEL}" (tabela abaixo).
  - `conversation.summary` em `text-ui text-ink-secondary whitespace-pre-wrap`.
  - Se `ticketId`: "Chamado em foco: INC-20311" com link que rola o painel até o card.
  | `TransferReason` | Rótulo |
  |---|---|
  | `pedido_do_funcionario` | O funcionário pediu para falar com um analista |
  | `caso_critico` | Caso crítico (prioridade Crítica) |
  | `chamado_vencido` | Chamado com prazo vencido |
  | `baixa_confianca` | O agent não teve segurança para seguir |

### 4.4 Barra de ações e composer — por estado

| Status | Barra (`Takeover Bar`, `bg-surface border-t border-border-subtle pt-3 px-5 pb-3.5 gap-2.5`) | Composer |
|---|---|---|
| `aguardando_atendente` (Tela 4) | ícone 36px `rounded-full bg-warning-tint` com `hand` 17px `text-warning-ink`; título "{Ana} espera um atendente" `text-body font-semibold`; corpo `text-meta text-muted` "Agent pausado · esperando há 7 min{ · chamado vencido}"; botões **Devolver ao agent** (secundário) + **Assumir atendimento** (primário) | travado (`opacity-55`), placeholder "Assuma o atendimento para responder" |
| `ativa` | ícone `bot` em `bg-primary-tint text-primary-ink`; "O agent está atendendo {Ana}"; corpo "Você pode assumir se quiser conduzir a conversa."; botão **Assumir atendimento** (secundário) | travado, mesmo placeholder |
| `em_atendimento` comigo (Tela 5) | sem barra; botões no **cabeçalho**: **Devolver ao agent** (secundário) + **Encerrar atendimento** (perigo) | ativo (abaixo) |
| `em_atendimento` com outro | ícone `headset` `bg-surface-subtle text-ink-secondary`; "{Rafael Lima} está atendendo"; corpo "Só quem assumiu pode responder." Sem botões | travado, placeholder "Só {Rafael} pode responder agora" |
| `encerrada` | ícone `circle-check`; "Conversa encerrada"; corpo "Por {nome} às 10:41." Sem botões | oculto |

Botões (medidas do protótipo):
- **Assumir atendimento**: `h-9 pl-3.5 pr-4 gap-1.75 rounded-control bg-primary`, `headset` 16px branco, `text-ui font-semibold text-white`.
- **Devolver ao agent** (barra): `h-9 pl-3 pr-3.5 gap-1.75 rounded-control outline-1 -outline-offset-1 outline-border-control
  drop-shadow-soft`, `bot` 15px `text-ink-secondary`, `text-ui font-medium text-ink-secondary`. No cabeçalho (Tela 5): `pl-2.5 pr-3 gap-1.5`, ícone 14px.
- **Encerrar atendimento**: `h-9 pl-2.5 pr-3 gap-1.5 rounded-control bg-danger-tint`, `circle-check-big` 14px + `text-ui font-semibold text-danger-ink`.
- Durante a requisição: botão clicado com spinner e rótulo "Assumindo…" / "Devolvendo…" / "Encerrando…"; os outros `disabled`.

Composer ativo (Tela 5): faixa `pt-2.5 px-5 pb-3.5 bg-surface border-t`; linha `gap-3`: caixa `flex-1 min-h-11 px-3.5 rounded-bubble
bg-surface-subtle` com `textarea` `text-body text-ink` (cresce até 6 linhas; foco `outline-[1.5px] outline-primary`), botão enviar
`size-11 rounded-full bg-primary` com `send-horizontal` 18px branco (`aria-label="Enviar mensagem"`). Enter envia, Shift+Enter quebra.
Placeholder: "Escreva para {Ana}…". Envio falho: bolha com "Não foi enviada. Tentar de novo" (igual ao chat).

**Confirmações** **[decisão]**:
- Encerrar → diálogo (`role="alertdialog"`, `w-[400px] p-5 rounded-card bg-surface shadow-popover`): título "Encerrar o atendimento?";
  texto "{Ana} vai ver que a conversa foi encerrada. Os chamados dela não mudam."; botões "Voltar" (secundário) e "Encerrar" (perigo, `bg-danger text-white`).
- Devolver ao agent → sem diálogo; toast "Conversa devolvida ao agent." com "Desfazer" por 5 s (desfazer = `claim` com a nova versão).
- Assumir → sem diálogo; divisória aparece, composer recebe foco.

### Conflito (409 `conflict`) e mudanças externas
- Ao receber 409, recarregar a conversa e mostrar faixa no topo da área de mensagens (`mx-10 mt-3 p-3 gap-2.5 flex rounded-control
  bg-warning-tint text-ui text-warning-ink`, ícone `users` 16px, `role="alert"`):
  - outro assumiu: "**{Rafael Lima}** assumiu esta conversa antes de você."
  - foi devolvida/encerrada por outro: "Esta conversa mudou enquanto você olhava: agora está {status}."
  Botão "Entendi" fecha. Barra de ações já reflete o novo estado.
- Se o polling detectar mudança de status feita por outra pessoa (sem ação minha), mostrar a mesma faixa.

### Estados da conversa
| Estado | Visual |
|---|---|
| Carregando | cabeçalho esqueleto + 4 bolhas esqueleto alternadas; barra de ações oculta. |
| Erro ao carregar | centro: "Não consegui abrir esta conversa." + "Tentar de novo". |
| 404 / sem permissão | "Esta conversa não existe ou não está mais disponível." + "Voltar para a lista". |
| Ação falhou (5xx) | toast `danger`: "Não consegui {assumir/devolver/encerrar}. Tente de novo." Estado não muda. |

---

## 5. Painel "Chamados do funcionário" (`aside`, `w-ticket-panel bg-surface border-l border-border-subtle flex flex-col`)

### Cabeçalho (`h-topbar pl-5 pr-3.5 gap-2 border-b`)
- Título `h2` "Chamados da {primeiro nome}" `text-body-lg font-semibold`; meta `text-meta text-muted`: "{a} abertos · {e} encerrados"
  (`isOpenStatus`; "1 aberto", "nenhum aberto").
- Fechar `x` 18px (36px) — **[decisão]** recolhe o painel (preferência salva em `localStorage`); reabre pelo botão "Chamados" do cabeçalho da conversa.

### Corpo (`flex-1 overflow-y-auto pt-6 px-5 pb-5 gap-8`)
- **Desta conversa** (rótulo `text-meta font-semibold text-muted`, `gap-3`) — chamado com `id = conversation.ticketId`:
  card `p-4 gap-3.5 rounded-bubble bg-surface-subtle`:
  - Resumo `gap-1.5`: linha id `text-meta font-medium text-muted flex-1` + status (ponto 7px + `text-meta font-semibold` na cor do status;
    `aguardando_analista` `warning-ink`, `em_andamento`/`aberto` `primary-ink`); título `text-body-lg/[20px] font-semibold`;
    meta `text-ui text-muted` "{Categoria} · prioridade {média}".
  - **Prazo** **[decisão]** `text-ui`: vencido → `clock-alert` 14px + "Prazo vencido há 2 dias" `text-prazo-vencido font-medium`;
    no prazo → `clock` + "Resposta até 13:43" `text-muted`.
  - Último evento `pt-3 border-t border-border-subtle gap-2`: ícone 15px `text-muted` + `text-ui text-ink-secondary flex-1` + hora `text-meta text-muted`.
    Derivado do status da conversa: aguardando → `arrow-right-left` "Transferido para um analista" · em atendimento → `headset`
    "Assumido por {nome}" · ativa → `bot` "Com o agent".
  - Sem `ticketId`: "Nenhum chamado em foco nesta conversa." `text-ui text-muted`.
- **Outros chamados** (`gap-1`): linhas `py-3 gap-3 flex items-center border-b border-border-subtle` (última sem borda):
  ponto 7px (cor do status) · texto `flex-1 gap-0.75`: título `text-body font-medium`, meta `text-meta text-muted`
  "{id} · {status}" (resolvidos: "{id} · Resolvido em 02 set"; vencidos: acrescenta " · vencido" em `text-prazo-vencido`) · `chevron-right` 16px.
  Clique **[decisão]** expande a linha (acordeão, `aria-expanded`) mostrando descrição, prioridade, aberto em e prazo; chevron gira 90°.
  Ordem: abertos primeiro (vencidos no topo), depois encerrados por `resolvedAt` desc.
- Rodapé `pt-3 px-4 pb-4`: "Ver todos os chamados da {Ana}" (`h-9 flex-1 rounded-control outline-1 outline-border-control drop-shadow-soft
  text-ui font-medium text-ink-secondary` + `arrow-up-right` 14px) — **[decisão]** só aparece se houver mais de 5 "outros";
  mostra os 5 primeiros e o botão expande a lista inteira (não há rota de chamados no escopo). Rótulo expandido: "Mostrar menos".

### Estados do painel
| Estado | Visual |
|---|---|
| Carregando | 1 card esqueleto + 3 linhas. |
| `ticketsAvailable = false` | no lugar das seções: `p-3.5 gap-2.5 rounded-bubble bg-warning-tint text-ui text-warning-ink`, ícone `cloud-off`: "Não consegui carregar os chamados agora. O sistema de chamados não respondeu." + botão "Tentar de novo" (recarrega a conversa). Nunca mostrar "nenhum chamado" nesse caso. |
| Sem chamados | "{Ana} ainda não tem chamados." |

---

## 6. Responsivo

- **≥ 1440 (`2xl`)**: rail 64 + lista 380 + conversa flex + painel 340 (protótipo).
- **1280–1439**: painel vira gaveta à direita sobreposta (`w-ticket-panel shadow-popover`), aberta pelo botão "Chamados".
- **1024–1279**: lista 320px; mensagens `px-6`.
- **768–1023**: rail + lista **ou** conversa (uma de cada vez). Conversa com botão voltar `arrow-left` no cabeçalho.
- **375px**: sem rail; barra superior `h-14 px-4` com símbolo, "Conversas", badge de "Para você" e avatar (menu com Sair).
  Lista em tela cheia; filtros com rolagem horizontal (`overflow-x-auto`, sem quebrar). Conversa em tela cheia com cabeçalho
  `h-14`: voltar · avatar 32 · nome/meta · menu. Botões de ação vão para a barra inferior em coluna: "Assumir atendimento"
  `w-full` em cima, "Devolver ao agent" `w-full` embaixo; na Tela 5, "Devolver" e "Encerrar" ficam no menu `⋮` e na barra
  inferior aparece só o composer. Painel de chamados vira folha inferior (`max-h-[80vh] rounded-t-card`), aberta por "Chamados".
  Bolhas `max-w-[85%]`; detalhe da decisão `w-full`.

## 7. Acessibilidade

- Regiões: `nav` (rail), `section aria-label="Lista de conversas"`, `main` (conversa, `h2` = nome do funcionário), `aside aria-label="Chamados de {nome}"`.
- Filtros: `tablist`/`tab` com setas esquerda/direita; contagem dentro do nome ("Para você, 3").
- Lista: `ul`; item `button` com nome "{Nome}, {tag de estado}, última mensagem às {hora}: {prévia}". Setas cima/baixo movem entre itens **[decisão]**.
- Mensagens: `role="log" aria-live="polite"` para mensagens novas do funcionário quando a conversa está aberta.
- Mudanças de estado (assumiu, devolveu, conflito) anunciadas em `role="status"`/`role="alert"`.
- Diálogo de encerrar: foco no "Voltar" ao abrir, preso no diálogo, Esc fecha, foco volta ao botão.
- Composer travado: `textarea disabled` com `aria-describedby` apontando para o texto da barra ("Assuma o atendimento para responder").
- Cor nunca sozinha: tags têm texto; badge de confiança tem nível escrito e número; status do chamado tem rótulo.
- Foco visível (tokens §6); alvos ≥ 24px; botões principais 36px.

## 8. Textos finais

- "Conversas" · "Disponível" · "Pesquisar conversa ou chamado" · "Limpar busca"
- Filtros: "Todas" · "Para você" · "Com o agent" · "Minhas"
- Tags: ver tabela §3. Tempo: "agora", "há 1 min", "há {n} min", "há {n} h", "ontem", "{dd mmm}".
- Cabeçalho: "Aguardando atendente" · "Com o agent" · "Você está atendendo" · "Com {nome}" · "Encerrada" · "Chamados" ·
  "Copiar resumo do caso" · "Encerrar conversa"
- Barra: "{Nome} espera um atendente" · "Agent pausado · esperando há {t}" · "O agent está atendendo {Nome}" ·
  "Você pode assumir se quiser conduzir a conversa." · "{Analista} está atendendo" · "Só quem assumiu pode responder." ·
  "Conversa encerrada" · "Assumir atendimento" · "Devolver ao agent" · "Encerrar atendimento" · "Assumindo…" · "Devolvendo…" · "Encerrando…"
- Composer: "Assuma o atendimento para responder" · "Escreva para {Nome}…" · "Só {Analista} pode responder agora"
- Resumo: "Resumo do caso para o analista" · "Motivo: …" · "Chamado em foco: {id}"
- Painel: "Chamados da {Nome}" · "{a} abertos · {e} encerrados" · "Desta conversa" · "Outros chamados" · "Ver todos os chamados da {Nome}" ·
  "Mostrar menos" · "Prazo vencido há {t}" · "Resposta até {hora}" · "Transferido para um analista" · "Assumido por {nome}" · "Com o agent" ·
  "Nenhum chamado em foco nesta conversa."
- Toast/diálogo: "Conversa devolvida ao agent." · "Desfazer" · "Encerrar o atendimento?" · "{Nome} vai ver que a conversa foi encerrada. Os chamados dela não mudam." · "Voltar" · "Encerrar"
- Conflito: "{Analista} assumiu esta conversa antes de você." · "Esta conversa mudou enquanto você olhava: agora está {status}." · "Entendi"

## 9. Pendências para backend/contrato

1. `ConversationSummary` sem `ticketId`: o protótipo mostra "Transferida · INC-20311". Incluir `ticketId` para a tag e a busca.
2. Ordenação da lista (§3) deve vir do servidor.
3. O "Desfazer" da devolução reusa `claim`; confirmar que `ativa → em_atendimento` via `claim` é permitido (o contrato diz que sim).
4. Filtro específico de baixa confiança (nota do Anexo A: "filtrável no console"): hoje está coberto pela tag dentro de "Para você".
   Se for preciso um filtro próprio, acrescentar `baixa_confianca` a `CONSOLE_FILTERS` — o design comporta uma 5ª pílula "Pouca confiança {n}".
