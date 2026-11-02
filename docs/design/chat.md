# Telas 2 e 3 — Chat do funcionário

Referências: `tela-2-novo-chamado.{png,html}` (perguntas, prioridade com prazo, rascunho) e
`tela-3-consulta-transferencia.{png,html}` (seleção de chamado, vencido, oferta de analista). Rota `/chat`.
Tokens: `tokens.md`. Chips e detalhe: `decision-trace.md`.

Dados: `GET /api/chat` → `ConversationView`; envio `POST /api/chat/messages` → SSE de `ChatStreamEvent`;
`POST /api/chat/new` para nova conversa; polling de `GET /api/chat` a cada 3 s enquanto `isAgentPaused(status)`.

---

## 1. Layout (1440 × 900)

```
┌ Sidebar 232 ┬──────────────────────── Main (flex-1) ─────────────────────────────┐
│ [N] Nexo    │ Service desk de TI › Atendimento               (● Assistente online) │ topbar 64
│ ▣ Atendim.  ├──────────────────────────────────────────────────────────────────────┤
│ ○ Meu perfil│            ┌──────────── coluna 808 (centrada) ────────────┐         │
│             │            │                       [bolha do funcionário]  │         │
│             │            │ Nexo Assist ✓ chip ✓ chip  Por quê? ˅         │         │
│             │            │ [bolha do agent 600]                          │         │
│             │            │ [card full 808]                               │         │
│             │            ├───────────────────────────────────────────────┤         │
│ ─────────── │            │ [aviso de estado, quando houver]              │         │
│ (AS) Ana    │            │ [ Escreva para o Nexo…           ( ↑ Enviar)] │         │
│ ⎋ Sair      │            │                     18/30 mensagens nesta sessão│       │
└─────────────┴────────────┴───────────────────────────────────────────────┴─────────┘
```

### Sidebar (`nav`, `w-sidebar`, `border-r border-border-subtle`, `pt-5 px-3.5 pb-3.5 flex flex-col`)
- Logo `px-2 gap-2.5`: símbolo 20px `fill-brand-mark` + "Nexo Assist" `text-brand font-bold text-ink`. Espaço 22px (`h-5.5`).
- Nav `gap-0.5`; item `h-9 px-2.5 gap-2.5 rounded-control`, ícone 16px:
  - ativo "Atendimento" (`message-square`): `bg-primary-tint`, ícone e rótulo `text-primary-ink`, `text-ui font-semibold`, `aria-current="page"`.
  - "Meu perfil" (`user-round`): ícone `text-muted`, rótulo `text-ui font-medium text-ink-secondary`; hover `bg-surface-subtle`.
    (Tela extra `extra-meu-perfil` — fora do escopo; o item pode existir e levar a ela quando for feita.)
- Espaçador `flex-1`.
- Usuário `border-t border-border-subtle pt-3.5 px-2 pb-1 gap-2.5`: avatar 34px `rounded-full bg-primary-tint`, iniciais
  `text-meta font-bold text-primary-ink`; nome `text-ui font-semibold text-ink`; e-mail `text-micro text-muted` (trunca).
- "Sair" (`log-out`): `h-8.5 px-2.5 gap-2.5 rounded-control text-ui font-medium text-ink-secondary` → `POST /api/auth/logout`, vai para `/login`.

### Topbar (`header`, `h-topbar px-8 gap-4 border-b border-border-subtle flex items-center`)
- Breadcrumb `flex-1 gap-2`: "Service desk de TI" `text-ui text-muted` · `chevron-right` 14px `text-muted` · "Atendimento" `text-ui font-semibold text-ink`.
- **Pílula de quem atende** (`StatusPill`, `py-1.25 px-2.5 gap-1.75 rounded-full text-meta font-semibold`) — sempre visível,
  responde "quem está atendendo agora":

| `conversation.status` | Ícone/ponto | Texto | Cores |
|---|---|---|---|
| `ativa` | ponto 7px `bg-success` | Assistente online | `bg-success-tint text-success-ink` (protótipo) |
| `aguardando_atendente` | `hand` 14px | Aguardando um analista | `bg-warning-tint text-warning-ink` |
| `em_atendimento` | `headset` 14px | {analystName} está atendendo | `bg-success-tint text-success-ink` |
| `encerrada` | `circle-check` 14px | Conversa encerrada | `bg-surface-subtle text-ink-secondary` |

### Coluna de mensagens
- Contêiner rolável `flex-1 overflow-y-auto`; dentro, `mx-auto w-full max-w-chat-column flex flex-col justify-end gap-5 pt-7 pb-1`
  (a 1440px isso dá os 200px laterais do protótipo). `justify-end`: poucas mensagens ficam junto do composer.
- Rolagem: ao abrir, vai ao fim. Nova mensagem rola ao fim **só se** o usuário já estava a ≤ 120px do fim; senão aparece
  o botão flutuante "Novas mensagens ↓" (`h-8 px-3 rounded-full bg-surface shadow-popover text-meta font-medium`, centrado acima do composer).
- Separador de dia **[decisão]** quando muda o dia: pílula centrada `px-2.5 py-1 rounded-full bg-surface-subtle text-caption
  font-medium text-muted` — "Hoje", "Ontem", "28 out".

### Composer (`pt-2.5 pb-4.5 gap-1.5`, mesma largura da coluna)
- Caixa `min-h-12 pl-4 pr-1.5 gap-2 rounded-bubble outline-1 outline-border-control bg-surface flex items-end` (o botão fica
  alinhado à última linha); foco: `outline-[1.5px] outline-primary`.
- `textarea` sem borda, `text-body text-ink`, placeholder `text-muted`, 1 linha (48px) crescendo até 6 linhas, depois rola;
  `py-3.25`. **Enter envia, Shift+Enter quebra linha.** Máx. 2000 caracteres (`SendMessageInput`).
- Botão Enviar `h-9 px-3 gap-1.5 rounded-tag bg-primary mb-1.5`: `arrow-up` 14px + "Enviar" `text-ui font-semibold text-white`.
  Desabilitado com texto vazio ou durante streaming.
- Linha meta `flex justify-end`: contador `text-meta text-muted tabular-nums` (ver §6). Contador de caracteres aparece à
  esquerda só a partir de 1.800: "1.850/2.000" (`text-warning-ink` a partir de 1.950).

---

## 2. Mensagens por papel

Cada mensagem é um `article`. Espaço entre mensagens: 20px (`gap-5`). Horário: não aparece no chat do protótipo; **[decisão]**
mostrar `title`/tooltip com hora ao passar o mouse e no texto acessível ("enviada às 10:04").

### Funcionário
- `flex justify-end`; bolha `max-w-bubble-user py-2.75 px-4 bg-ink rounded-bubble rounded-br-tail`; texto `text-body text-white`,
  `whitespace-pre-wrap break-words`.
- **Enviando** (antes do `saved`): `opacity-70`; se o envio falhar antes do `saved`, a bolha fica com borda `outline-1 outline-danger`
  e abaixo, à direita, `text-meta text-danger-ink`: "Não foi enviada. **Tentar de novo**" (link-botão).

### Agent ("Nexo Assist")
- Coluna `flex flex-col items-start gap-1.5`:
  1. Linha de chips (`ActionChips`, ver `decision-trace.md` §1).
  2. Painel `DecisionDetails` (fechado por padrão).
  3. Bolha `max-w-bubble-agent py-3 px-4 gap-3 flex flex-col bg-surface rounded-bubble rounded-tl-tail outline-1
     -outline-offset-1 outline-border-subtle`; texto `text-body/[22px] text-ink`. Markdown limitado: parágrafos, **negrito**
     (o protótipo usa semibold para a pergunta "Quem está sendo afetado?"), listas e links (abrem em nova aba).
  4. Blocos (§3), em `w-full` (808px), na ordem de `blocks`.
- Mensagem sem `content` (só blocos): não renderiza bolha vazia.

### Analista **[decisão — o protótipo não mostra o analista no chat do funcionário]**
- Igual ao agent, mas a linha de cima é "**Rafael Lima**" `text-meta font-semibold text-ink` + tag "Suporte N2"
  `px-1.5 py-px rounded-tag bg-success-tint text-tiny font-semibold text-success-ink` (nível vem de `SessionUser.detail`
  do analista; se ausente, "Analista"). Sem chips nem "Por quê?" (não há trace).
- Bolha `bg-bubble-analyst` sem contorno, mesmo raio do agent.

### Sistema e bloco `event`
- Divisória do console: `flex items-center gap-3 pt-2 pb-1`; linhas `flex-1 h-px bg-divider-soft`; centro `gap-1.5`,
  ícone 13px `text-muted` + `text-caption font-medium text-muted`. Ícones por evento:
  transferência `arrow-right-left`, analista assumiu `headset`, devolvida ao agent `bot`, encerrada `circle-check`,
  outros `info`.
- Textos esperados (vindos do backend em `content`/`event.text`; a UI só aplica ícone por palavra-chave ou, melhor, por um
  campo de tipo — ver pendências): "Transferida para um analista · 10:05", "Rafael Lima entrou na conversa · 10:12",
  "Rafael Lima devolveu a conversa ao assistente · 10:40", "Conversa encerrada por Rafael Lima · 10:41".

---

## 3. Blocos

### 3.1 `ticket_cards` — cartão de chamado (Tela 3)
- Card `w-full rounded-card bg-surface outline-1 -outline-offset-1 outline-border-card shadow-card overflow-hidden`.
- Corpo `pt-4 px-4.5 pb-3.5 gap-1.5 flex flex-col`:
  - Eyebrow `pb-0.5 gap-2 flex items-center`: tipo `text-meta font-medium text-muted` ("Incidente" / "Requisição")
    **[decisão: o protótipo diz "Chamado"; trocar pelo tipo deixa o tipo sempre visível]** · separador 3px `rounded-full
    bg-border-subtle` · número `text-meta text-muted` · `flex-1` · status (ponto 6px na cor do status + `text-meta
    font-medium`; `aguardando_analista` em `text-warning-ink`, demais em `text-ink-secondary`).
  - Título `text-card-title font-semibold text-ink`. Descrição `text-ui text-ink-secondary` (máx. 3 linhas, `line-clamp-3`;
    "Ver mais" `text-meta font-medium text-primary-ink` expande).
- Campos `px-4.5 pb-4`; grade `border-t border-border-subtle pt-3 grid grid-cols-4 gap-6`; cada campo `gap-1`: chave
  `text-meta text-muted`, valor `text-body font-medium text-ink`:
  | Chave | Valor |
  |---|---|
  | Categoria | `CATEGORY_LABELS` |
  | Prioridade | ponto 6px `prioridade-*` + rótulo |
  | Aberto em | "16 out, 14:20" |
  | Última atualização | "há 5 dias" + nota de prazo `text-ui text-muted` |
- **Nota de prazo** (usa `isOverdue(dueAt, now)` de `sla.ts`):
  - vencido: valor "há 5 dias" em `text-prazo-vencido` + "· prazo vencido" (`text-muted`) + ícone `clock-alert` 14px
    `text-prazo-vencido` antes do valor (protótipo + ícone **[decisão]**).
  - no prazo: "há 2 h" + "· resposta até 13:43" (hoje), "até amanhã, 10:00", "até 05 nov, 10:00".
  - resolvido/fechado (`dueAt` nulo): chave vira "Resolvido em", valor "28 out"; se ≤ 7 dias, nota "· dá para reabrir até 04 nov".
- Vários chamados: pilha `gap-2`; com mais de 3, mostra 3 e o botão "Ver mais {n} chamados" (`text-ui font-medium text-primary-ink`).
- Card é informativo (não clicável).

### 3.2 `ticket_selection` — escolher chamado (Tela 3)
- `prompt` vai na bolha do agent (se o `content` já trouxer a pergunta, não repetir).
- Card igual ao 3.1 (raio, contorno, sombra), sem padding; uma **linha por chamado** `h-11.5 px-4 gap-3.5 flex items-center`,
  `border-t border-border-subtle` a partir da 2ª:
  - "rádio" decorativo 16px: desmarcado `border-[1.5px] border-radio-off`, marcado `border-[5px] border-primary`, fundo branco.
  - número `text-meta font-medium text-muted` (largura fixa `w-20` para alinhar) · título `flex-1 text-body font-medium text-ink truncate`
    · status (ponto 6px + `text-meta text-muted`; se vencido, acrescenta " · vencido" em `text-prazo-vencido`) · data `w-11 text-right text-meta text-muted`.
- Interação: cada linha é um **`button`** (não radio): clique/Enter envia a mensagem `"{id} · {título}"` (texto da Tela 3).
  Hover/foco `bg-primary-hover-row` e o rádio aparece marcado; após o envio, a linha escolhida fica marcada e todas ficam
  `disabled` (o card vira histórico).
- Só o bloco da **última** mensagem do agent é interativo; os anteriores ficam desabilitados com a escolha marcada
  (identificada pela mensagem seguinte do funcionário que comece com o id).

### 3.3 `draft` — rascunho de chamado (Tela 2)
Anatomia (protótipo + campos que faltavam):
- Card como 3.1. Corpo `pt-4 px-4.5 pb-3.5 gap-1.5`:
  - Eyebrow: "Novo chamado" `text-meta font-medium text-muted` · sep · "Rascunho" `text-meta text-muted` · `flex-1` ·
    estado (ponto 6px + `text-meta font-medium`, tabela abaixo).
    **[decisão]** o protótipo mostra "Rascunho D-381"; o `actionId` é interno — não exibir, a menos que o backend passe um código curto.
  - Título `text-card-title`; descrição `text-ui text-ink-secondary` (completa, sem clamp: o funcionário precisa conferir tudo).
- Campos `px-4.5 pb-4`, grade `border-t pt-3 grid grid-cols-4 gap-6` **[decisão: acrescenta "Tipo"; Anexo A exige o tipo visível]**:
  | Chave | Valor |
  |---|---|
  | Tipo | "Incidente" / "Requisição" |
  | Categoria | "Rede e VPN" |
  | Prioridade | ponto + "Alta" + `text-ui text-muted` "· resposta até 13:43" (de `dueAtPreview`; mesmo formato de 3.1) |
  | Afetados | "Somente você" / "Sua equipe" / "A empresa toda" (2ª pessoa, como no protótipo) |
- **Motivo da prioridade** **[decisão]**: abaixo da grade, `pt-2.5 text-ui text-ink-secondary` com ícone `info` 14px:
  "Por que Alta: {draft.priorityReason}".
- Barra de ações `py-2 pl-2 pr-3.5 gap-1.5 bg-surface-subtle border-t border-border-subtle flex items-center`:
  - **Confirmar** (primário) `h-9 pl-3.5 pr-2.5 gap-2 rounded-control bg-primary`: "Confirmar" `text-ui font-semibold text-white`
    + atalho `px-1.25 py-px rounded-tag bg-white/14 text-micro text-white/80` "Ctrl ↵" (Windows/Linux) ou "⌘↵" (macOS);
    atalho só aparece em dispositivos com teclado (`@media (hover:hover)`) e funciona com o foco dentro do card ou no composer vazio.
  - **Ajustar** (secundário) `h-9 px-3.5 rounded-control bg-surface outline-1 outline-border-control shadow-button text-ui font-medium text-ink`.
    **[decisão: "Editar" no protótipo → "Ajustar", pedido do briefing; mesma aparência]**
  - **Cancelar** (ghost) `h-9 px-3.5 rounded-control text-ui font-medium text-ink-secondary`; hover `bg-surface`.

**O que cada ação faz** (o backend só cria em mensagem posterior; a UI envia texto):

| Ação | Mensagem enviada como o funcionário | Efeito esperado |
|---|---|---|
| Confirmar | "Confirmo, pode criar o chamado." | agent chama `confirm_pending_action`; próxima mensagem traz `ticket_cards` com o chamado criado |
| Ajustar → Enviar ajustes | "Quero ajustar o rascunho: {lista de mudanças}." ex.: "prioridade: Média; categoria: Software; descrição: …" | agent monta novo rascunho (novo card); este fica "Substituído" |
| Cancelar | "Pode cancelar, não quero abrir esse chamado." | agent descarta; card fica "Cancelado" |

**Modo Ajustar** (inline, no próprio card; não abre modal):
- Título → `input` `h-10 px-3 rounded-control outline-1 outline-border-control text-body font-semibold`.
- Descrição → `textarea` 3–8 linhas `text-ui`.
- Tipo, Categoria, Prioridade, Afetados → `select` nativo estilizado `h-9 px-2.5 rounded-control outline-1 outline-border-control text-ui`.
  Mudar a prioridade recalcula o "· resposta até …" com `computeDueAt(prioridade, agora)` e mostra abaixo `text-meta text-muted`:
  "O assistente vai reavaliar a prioridade com base no impacto e na urgência."
- Barra: "Enviar ajustes" (primário) + "Descartar ajustes" (ghost). Sem mudanças, "Enviar ajustes" fica desabilitado.
- Rótulos dos campos viram `label` visíveis (os mesmos da grade).

**Estados do rascunho** (derivados da conversa — ver pendências para um status vindo do backend):

| Estado | Como saber | Eyebrow (ponto + texto) | Ações |
|---|---|---|---|
| Aguardando confirmação | é o rascunho mais recente e não houve `confirm_pending_action` ok depois | `warning` · "Aguardando confirmação" (`text-warning-ink`) | Confirmar / Ajustar / Cancelar |
| Enviando | clicou e o turno está em streaming | idem | botões `disabled`; o clicado mostra spinner + "Criando…" / "Enviando…" / "Cancelando…" |
| Criado | trace posterior com `confirm_pending_action` ok e outcome `criou_chamado` | `success` · "Criado como INC-20517" (`text-success-ink`) | barra some; card fica `opacity-80` |
| Falhou ao criar | trace posterior com `confirm_pending_action` erro | `warning` · "Aguardando confirmação" + alerta no card (abaixo) | "Tentar de novo" (envia a mesma confirmação) / Ajustar / Cancelar |
| Substituído | existe `draft` mais novo | neutro `status-encerrado` · "Substituído por um rascunho novo" | sem ações; `opacity-60` |
| Cancelado | a mensagem seguinte do funcionário é a de cancelar | neutro · "Cancelado — nada foi criado" | sem ações; `opacity-60` |
| Agent pausado | `isAgentPaused(status)` | inalterado | botões `disabled` + `text-meta text-muted` na barra: "O assistente está pausado enquanto o analista atende." |

**Alerta de falha no card** (acima da barra, `mx-4.5 mb-3 p-3 gap-2.5 flex rounded-control bg-warning-tint text-ui text-warning-ink`,
ícone `triangle-alert` 16px, `role="alert"`):
"O sistema de chamados não respondeu ({n} tentativas). **Nada foi criado.** Tente confirmar de novo em instantes."

### 3.4 `update_draft` — proposta de complementar ou reabrir **[decisão: não está no protótipo]**
Mesmo card do rascunho, com:
- Eyebrow: "Complementar chamado" ou "Reabrir chamado" · sep · `{ticket.id}` · `flex-1` · "Aguardando confirmação".
- Título = `ticket.title` (não editável). Abaixo, status atual do chamado (ponto + rótulo) em `text-meta`.
- Bloco "O que vou acrescentar": `mt-1 pl-3 border-l-2 border-border-subtle text-ui text-ink whitespace-pre-wrap` com `comment`.
- Grade (só o que muda): "Prioridade" → "Média → **Alta**" (ponto da nova) quando `newPriority`; "Situação" → "Resolvido → **Reaberto**"
  quando `reopen`, com nota "· resolvido há 3 dias, dentro do limite de 7 dias para reabrir".
- Botões: "Confirmar atualização" / "Confirmar reabertura", "Ajustar", "Cancelar".
- Mensagens enviadas: "Confirmo, pode atualizar o {id}." · "Confirmo, pode reabrir o {id}." · Ajustar → "Quero ajustar a atualização do {id}: {mudanças}" ·
  Cancelar → "Pode cancelar, não quero mudar o {id}."
- Modo Ajustar: `textarea` do comentário + `select` de prioridade.
- Estados: os mesmos de 3.3; "Criado como" vira "Atualizado" / "Reaberto".

### 3.5 `quick_replies` — opções rápidas (Telas 2 e 3)
- Linha `flex flex-wrap gap-1.5`; botão `py-1.75 px-3 rounded-control bg-surface outline-1 -outline-offset-1 outline-border-subtle
  text-ui font-medium text-ink`; hover `bg-surface-subtle`.
- Posição: **dentro da bolha** quando a mensagem não tem cards (Tela 2); **abaixo dos cards**, fora de bolha, quando tem (Tela 3).
- Clique envia o texto da opção como mensagem do funcionário. A opção escolhida fica no estilo selecionado do protótipo
  (`bg-primary-tint outline-accent text-primary-ink`) e todas ficam desabilitadas.
- Só a última mensagem do agent tem opções ativas. Com agent pausado, opções desabilitadas.

---

## 4. Estados da conversa

### 4.1 Vazio (primeira visita, conversa sem mensagens) **[decisão]**
Centro da coluna (`justify-center` só neste estado), `max-w-[560px] mx-auto text-center flex flex-col items-center gap-3`:
- Símbolo 32px `fill-brand-mark`.
- Título `font-serif text-empty text-ink`: "Como posso ajudar, {primeiro nome}?"
- Texto `text-body text-muted`: "Conte com suas palavras o que está acontecendo. Eu consulto seus chamados, busco na central de ajuda e chamo um analista quando precisar."
- Sugestões (estilo opção rápida, `mt-3`): "Minha VPN não conecta" · "Como está meu chamado?" · "Preciso de acesso a um sistema" · "Quero falar com um analista".
  Clique envia o texto.

### 4.2 Carregando
- Inicial: 3 blocos esqueleto alternados (direita 280×44, esquerda 520×88, direita 200×44) `rounded-bubble bg-surface-subtle animate-pulse`;
  composer desabilitado com placeholder "Carregando a conversa…". `aria-busy="true"` na coluna.
- Erro ao carregar: centro da coluna, ícone `cloud-off` 24px `text-muted`, "Não consegui carregar sua conversa." `text-body font-medium`,
  "Verifique sua conexão e tente de novo." `text-ui text-muted`, botão secundário "Tentar de novo".

### 4.3 Streaming
Sequência em `decision-trace.md` §1 (Streaming). Na bolha: antes do primeiro `text`, não há bolha — só a linha de chips com
"trabalhando…". Durante: botão Enviar desabilitado, `textarea` continua editável (o funcionário pode ir escrevendo).
Se nenhum evento chegar em 20 s **[decisão]**, "trabalhando…" vira "ainda trabalhando… o sistema de chamados está lento" (`text-muted`).

### 4.4 Erros
| Situação | Onde | Texto |
|---|---|---|
| Ação com `erro` no legado (agent respondeu com honestidade) | chip de erro + texto do agent; detalhe mostra tentativas | (texto vem do agent) |
| Falha ao confirmar rascunho | alerta no card (3.3) | ver 3.3 |
| Evento `error` `unavailable` | no lugar da resposta, bloco de aviso (abaixo) | "O assistente está fora do ar por alguns instantes. Sua mensagem ficou registrada." + "Tentar de novo" |
| Evento `error` `internal` | idem | "Algo deu errado do nosso lado e não consegui responder. Sua mensagem ficou registrada." + "Tentar de novo" |
| `error` `limit_reached` | vai para 4.6 | — |
| `error` `agent_paused` | trata como `paused` (4.5) | — |
| 401 / `unauthorized` | redireciona para `/login?motivo=sessao` | — |
| Envio falhou antes do `saved` | na bolha do funcionário (§2) | "Não foi enviada. Tentar de novo" |

Bloco de aviso (no lugar da bolha do agent, alinhado à esquerda): `max-w-bubble-agent p-3 gap-2.5 flex rounded-bubble
bg-warning-tint text-ui text-warning-ink`, ícone `triangle-alert` 16px, botão `text-ui font-semibold underline`.
"Tentar de novo" reenvia o mesmo texto (conta como nova mensagem — ver pendências). `role="alert"`.
Regra de honestidade: nenhum estado de erro mostra card "Criado" ou chip "criou" — só o que o trace registrou como `ok`.

### 4.5 Agent pausado — com analista (`aguardando_atendente` / `em_atendimento`)
- Pílula do topo muda (§1).
- **Aviso fixo acima do composer** (`AgentPausedNotice`, inspirado na "Takeover Bar" da Tela 4) `mb-2 p-3 gap-3 flex items-center
  rounded-bubble bg-surface-subtle`:
  - Ícone 36px `rounded-full` (`hand` em `bg-warning-tint text-warning-ink` / `headset` em `bg-success-tint text-success-ink`).
  - Título `text-body font-semibold text-ink` + corpo `text-meta text-muted`:
    - aguardando: "Chamei um analista para você" / "Ele vai ver o resumo do caso e responder por aqui. Enquanto isso, o assistente fica pausado. Pode deixar mais detalhes, se quiser."
    - em atendimento: "{Rafael Lima} está atendendo você" / "Suas mensagens vão direto para o analista. O assistente está pausado."
- Composer continua habilitado; placeholder "Escreva para o analista…". Ao enviar, o stream retorna `saved` + `paused`: a bolha
  do funcionário aparece normalmente, **sem** linha "trabalhando…".
- Polling de 3 s; mensagens novas do analista entram com `aria-live="polite"`: "{Rafael Lima}: {texto}".
- Quando volta para `ativa` (devolvida): aviso some, divisória "Rafael Lima devolveu a conversa ao assistente", pílula volta a "Assistente online".
- Cards e opções ficam desabilitados durante a pausa (3.3, 3.5).

### 4.6 Limite de 30 mensagens
Contador (`messagesUsed`/`messagesLimit` do `ConversationView`, atualizado em cada `saved`):

| Faixa | Texto | Estilo |
|---|---|---|
| 0–24 | "18/30 mensagens nesta sessão" | `text-meta text-muted` (protótipo) |
| 25–29 | "26/30 mensagens nesta sessão · restam 4" | `text-warning-ink`, ícone `info` 12px |
| 30 | "30/30 · limite da sessão atingido" | `text-warning-ink` |

No limite: composer substituído por `SessionLimitNotice` (`p-4 gap-3 rounded-bubble bg-surface-subtle outline-1 outline-border-subtle`):
- Título `text-body font-semibold`: "Esta sessão chegou ao limite de 30 mensagens"
- Corpo `text-ui text-muted`: "Seus chamados e rascunhos continuam salvos. Comece uma nova conversa e eu sigo de onde paramos, com um resumo desta."
- Botão primário "Começar nova conversa" (`POST /api/chat/new`) — ver pendência sobre a conversa ainda ativa.
- Cards pendentes: o rascunho continua confirmável? Não — confirmar exige mensagem. Mostrar no card: "Para confirmar, comece uma nova conversa." **[decisão]**
- `aria-live="polite"` anuncia ao chegar em 25 e em 30.

### 4.7 Retomada (história 6)
- `GET /api/chat` devolve a conversa em andamento: renderiza o histórico completo, rola ao fim, separadores de dia.
- Se a última mensagem tem mais de 1 h **[decisão]**, divisória de sistema "Você voltou · continuamos de onde paramos" (só visual, não persiste).
- Rascunho ainda pendente continua interativo, com nota no eyebrow: "Aguardando confirmação desde ontem, 16:20".
- Conversa nova criada com resumo da anterior (`carryover`): o backend envia uma mensagem `sistema`/`event` — a UI a mostra como
  divisória com ícone `history`: "Retomei o resumo da sua conversa anterior".

### 4.8 Encerrada
- Composer substituído por aviso: "Esta conversa foi encerrada{ por Rafael Lima} às 10:41." + botão primário "Começar nova conversa".
- Histórico continua legível; cards sem ações.

### 4.9 Assunto fora de TI
- Turno com `outcome = redirecionou`: chip derivado "viu que o assunto não é de TI"; bolha com o texto do agent (que indica
  a área). **[decisão]** abaixo da bolha, nota `text-meta text-muted` com ícone `compass` 12px: "Sem chamado aberto: esse
  assunto é de outra área." Nenhum card.

### 4.10 Oferta de chamar analista / chamado vencido (Tela 3)
- Card do chamado com prazo vencido (3.1) + bolha com texto e `quick_replies` ("Falar com um analista", "Adicionar informação",
  "Não, obrigado"), exatamente como o protótipo.
- Ao escolher "Falar com um analista", o próximo turno traz o chip "chamou um analista", a divisória de transferência e o aviso 4.5.

---

## 5. Responsivo

### 1440px (`2xl`)
Como o protótipo: sidebar 232 fixa, coluna 808 centrada (200px de cada lado), cards 808.

### 1024–1439
Sidebar 232; coluna `max-w-chat-column` com `px-8`; bolha agent `max-w-bubble-agent`.

### 768–1023
Sidebar recolhe para 64px só com ícones (tooltip com o rótulo); usuário vira só avatar com menu (nome, e-mail, Sair).

### 375px (base)
- Sem sidebar. **Topbar** `h-14 px-4 gap-3`: botão menu 40px (`menu` 20px, `aria-label="Abrir menu"`) · símbolo + "Nexo Assist" ·
  `flex-1` · pílula de estado só com ponto/ícone + texto curto ("Online", "Aguardando", "Com analista", "Encerrada").
  Breadcrumb oculto.
- Menu: gaveta à esquerda `w-[280px]`, mesmo conteúdo da sidebar, `role="dialog" aria-modal`, fecha com Esc/fundo/rota; foco preso.
- Coluna `px-4 gap-4 pt-4`; bolha do funcionário `max-w-[85%]`; bolha do agent `w-full`.
- Chips quebram em várias linhas; "+N" a partir do 4º chip.
- Cards: grade de campos `grid-cols-2 gap-x-4 gap-y-3`; corpo `px-4`; título `text-[16px]/[21px]`.
  Barra de ações: Confirmar `flex-1` + Ajustar + Cancelar (atalho de teclado oculto). Em telas < 360px, Cancelar vai para a linha de baixo.
- Seleção de chamado: cada linha vira 2 linhas `py-3 h-auto`: (rádio · número · data) / (título) / (status). Alvo ≥ 44px.
- Opções rápidas quebram linha; altura mínima 36px.
- Composer fixo no rodapé com `pb-[max(12px,env(safe-area-inset-bottom))]`; botão Enviar só ícone (`size-9`, `aria-label="Enviar"`).
- Contador abaixo do composer, centralizado.
- Aviso de pausa: ícone 32px, texto do corpo encurtado ("Ele responde por aqui. O assistente está pausado.").

---

## 6. Acessibilidade

- Estrutura: `nav` (sidebar), `header` (topbar), `main` com `h1` visualmente oculto "Atendimento"; lista de mensagens
  `role="log" aria-live="polite" aria-relevant="additions"` **apenas** para mensagens finais (o streaming usa a região de
  status de `decision-trace.md` §4 para não ler pedaços).
- Cada mensagem: `article` com nome acessível "{Autor}, {hora}". Bolha do funcionário: prefixo oculto "Você disse:".
- Pílula de estado: `role="status"`; mudanças (transferência, analista entrou, devolvida) são anunciadas.
- Composer: `label` oculto "Mensagem para o Nexo Assist" / "Mensagem para o analista"; `aria-describedby` no contador.
  No limite, o aviso recebe foco.
- Cards: `section` com `aria-labelledby` no título; rascunho com `aria-describedby` no estado ("Aguardando confirmação").
  Botões com nome completo: "Confirmar e criar o chamado", "Ajustar o rascunho", "Cancelar o rascunho".
- Seleção de chamado: `ul` de `button`s com nome "Ver {id}, {título}, {status}{, vencido}".
- Opções rápidas: `role="group"` com `aria-label` = pergunta da bolha; escolhida com `aria-pressed="true"`.
- Status nunca só por cor: todo ponto tem rótulo; vencido tem ícone + texto; prioridade Baixa tem forma diferente.
- Foco visível (tokens §6). Após enviar, o foco permanece no composer. Após "Ajustar", foco no 1º campo; "Descartar ajustes" devolve
  ao botão Ajustar.
- Atalho Ctrl/⌘+Enter documentado no `aria-keyshortcuts` do botão Confirmar.

---

## 7. Textos finais (resumo)

- Placeholder: "Escreva para o Nexo…" · pausado: "Escreva para o analista…"
- Enviar: "Enviar"
- Contador: "{n}/30 mensagens nesta sessão" · "· restam {k}" · "30/30 · limite da sessão atingido"
- Pílulas: "Assistente online" · "Aguardando um analista" · "{Nome} está atendendo" · "Conversa encerrada"
- Rascunho: "Novo chamado" · "Rascunho" · "Aguardando confirmação" · "Criado como {id}" · "Substituído por um rascunho novo" ·
  "Cancelado — nada foi criado" · "Por que {Prioridade}: …" · "Confirmar" · "Ajustar" · "Cancelar" · "Enviar ajustes" ·
  "Descartar ajustes" · "Criando…" · "Tentar de novo"
- Atualização: "Complementar chamado" · "Reabrir chamado" · "O que vou acrescentar" · "Confirmar atualização" · "Confirmar reabertura"
- Cartão: "Categoria" · "Prioridade" · "Aberto em" · "Última atualização" · "Resolvido em" · "prazo vencido" · "resposta até {hora}" ·
  "dá para reabrir até {data}" · "Ver mais" · "Ver mais {n} chamados"
- Campos: "Tipo" · "Categoria" · "Prioridade" · "Afetados" · "Somente você" · "Sua equipe" · "A empresa toda"
- Novas mensagens: "Novas mensagens"
- Demais textos nas tabelas acima.

---

## 8. Pendências para backend/contrato (a UI funciona sem elas, com as derivações descritas)

1. **Estado do rascunho**: hoje a UI deriva "criado / substituído / cancelado" da conversa. Ideal: o backend marcar o bloco
   `draft`/`update_draft` com `status: "pendente" | "confirmado" | "substituido" | "cancelado"` e `ticketId` quando confirmado.
2. **Confirmar/cancelar por texto**: os botões enviam frases fixas (§3.3). Se o backend preferir, um campo opcional
   `SendMessageInput.actionId` + `intent: "confirmar" | "cancelar" | "ajustar"` torna a confirmação determinística.
3. **Tipo de evento de sistema**: `event` só tem `text`; um `eventKind` (`transferida`, `assumida`, `devolvida`, `encerrada`,
   `retomada`) permite ícone sem adivinhar pelo texto.
4. **Limite de 30 e nova conversa**: `POST /api/chat/new` está descrito como "depois que a anterior foi encerrada". No limite,
   a conversa ainda está `ativa`: o backend precisa encerrar (com resumo/carryover) e criar a nova. Também decidir se mensagens
   trocadas com o analista contam para o limite (sugestão: não contam — bloquear o funcionário no meio do atendimento humano é ruim).
5. **"Tentar de novo" depois de `error`**: reenviar conta mais uma mensagem. Alternativa: rota de retry do último turno.
6. **Nível do analista** no chat do funcionário (tag "Suporte N2"): `ConversationView` só tem `analystName`; incluir `analystTier`.
