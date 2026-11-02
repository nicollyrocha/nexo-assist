# Tokens de design — Nexo Assist

Fonte: HTML exportado do Pencil em `docs/anexos/C-prototipo/*.html` (valores copiados das classes, não estimados
do PNG). Quando um valor não existe no protótipo, está marcado **[decisão]**.

Convenções:
- Medidas em px. O Tailwind v4 aceita qualquer múltiplo de 0,25 na escala de espaçamento (`--spacing: 0.25rem`),
  então **todo px inteiro do protótipo vira `n/4`**: 10px → `p-2.5`, 14px → `p-3.5`, 18px → `p-4.5`,
  7px → `gap-1.75`, 9px → `px-2.25`, 11px → `py-2.75`. Não use valores arbitrários (`p-[14px]`) para espaçamento.
- Cores com alfa no protótipo (`#1B24311F`) viraram tokens próprios (é o mesmo hex de 8 dígitos).
- Ícones: o protótipo usa **Lucide** (`data-icon-set="lucide"`). Nomes citados nas specs são nomes Lucide.
  Usar `lucide-react` exige ADR curto (biblioteca fora da stack) — alternativa: SVG inline dos mesmos ícones.

---

## 1. Cores

### Neutros (texto, superfícies, bordas)

| Token | Hex | Onde aparece no protótipo | Classe |
|---|---|---|---|
| `ink` | `#1B2431` | texto principal; bolha do funcionário; fundo do painel de apresentação do login | `text-ink`, `bg-ink` |
| `ink-secondary` | `#3D4656` | rótulos de navegação inativos, descrição de card, botões secundários | `text-ink-secondary` |
| `muted` | `#5B6472` | metadados, chips de ação, placeholders, ícones | `text-muted` |
| `surface` | `#FFFFFF` | fundo das telas, bolha do agent no chat, cards | `bg-surface` |
| `surface-subtle` | `#F6F7F9` | rail do console, busca, filtros, barra de ações do card, item selecionado, card "Desta conversa" | `bg-surface-subtle` |
| `surface-thread` | `#EEF1F5` | fundo da conversa no console | `bg-surface-thread` |
| `border-subtle` | `#E6E8EC` | divisórias, contorno da bolha do agent, opções rápidas | `border-border-subtle`, `outline-border-subtle` |
| `border-control` | `#1B24311F` | contorno de input, composer e botão secundário | `outline-border-control` |
| `border-card` | `#1B243117` | contorno dos cards (rascunho, chamado, seleção) | `outline-border-card` |
| `divider-soft` | `#1B243114` | linhas do evento de sistema no console | `bg-divider-soft` |
| `radio-off` | `#1B243133` | borda do rádio desmarcado | `border-radio-off` |
| `day-pill` | `#FFFFFFCC` | pílula "Hoje" no console | `bg-day-pill` |

### Primária (marca e ações)

| Token | Hex | Uso | Classe |
|---|---|---|---|
| `primary` | `#0062C4` | botão primário (Entrar, Enviar, Confirmar, Assumir), checkbox, rádio marcado, foco | `bg-primary` |
| `primary-ink` | `#0069C7` | links, item ativo do menu, iniciais do avatar, tag "IA" | `text-primary-ink` |
| `accent` | `#0285F7` | ponto "em andamento", contorno da opção selecionada | `bg-accent`, `outline-accent` |
| `primary-tint` | `#0285F712` | fundo do item ativo, avatar do usuário, opção selecionada, filtro ativo, tag "IA" | `bg-primary-tint` |
| `primary-hover-row` | `#0062C40A` | linha selecionada/hover na seleção de chamado | `bg-primary-hover-row` |
| `brand-mark` | `#037AF6` | símbolo da Nexo sobre fundo claro (no login, sobre fundo escuro, é `#FFFFFF`) | `fill-brand-mark` |
| `bubble-agent` | `#E6EFFA` | bolha do agent **no console** | `bg-bubble-agent` |
| `avatar-primary` | `#DCE9F7` | avatar do funcionário no console (par com `primary` nas iniciais) | `bg-avatar-primary` |

### Semânticas de estado

| Família | Ponto / ícone | Texto (ink) | Fundo (tint) | Uso no protótipo |
|---|---|---|---|---|
| `success` | `#00BD6C` | `#00804A` | `#00BD6C14` | "Assistente online", "Disponível", analista (tag "Suporte N2") |
| `warning` | `#F5A500` | `#946300` | `#F5A50018` | "Aguardando confirmação", "Aguardando analista", "Aguardando atendente", prazo vencido, "Agent pediu ajuda" |
| `danger` | `#EE343B` | `#C4161D` | `#EE343B12` | "Transferida", "Encerrar atendimento" |
| `bubble-analyst` | — | — | `#E3F4EA` | bolha do analista |

Classes: `bg-success`, `text-success-ink`, `bg-success-tint`, idem `warning-*`, `danger-*`.

### Tokens semânticos de domínio (aliases das famílias acima)

Use **estes** nomes nos componentes; as famílias acima ficam para casos genéricos.

**Status do chamado** (`TicketStatus`, rótulos de `TICKET_STATUS_LABELS`). Ponto 6–7px + rótulo sempre juntos.

| Status | Token do ponto | Hex | Rótulo (cor) |
|---|---|---|---|
| `aberto` | `status-aberto` | `#0285F7` | "Aberto" (`muted`) **[decisão: protótipo não mostra]** |
| `em_andamento` | `status-andamento` | `#0285F7` | "Em andamento" (`muted`) |
| `aguardando_analista` | `status-aguardando` | `#F5A500` | "Aguardando analista" (`muted` em lista; `warning-ink` no card) |
| `aguardando_funcionario` | `status-voce` | `#0062C4` | "Aguardando você" (`primary-ink`, semibold) **[decisão]** |
| `aprovado` | `status-aprovado` | `#00BD6C` | "Aprovado" (`muted`) |
| `resolvido` / `fechado` | `status-encerrado` | `#1B243140` | "Resolvido" / "Fechado" (`muted`) |

**Prazo** (Anexo A: prazo de primeira resposta e de cada atualização).

| Estado | Token | Hex | Apresentação |
|---|---|---|---|
| no prazo | `prazo-ok` (texto) | `#5B6472` | "resposta até 13:43", ícone `clock` 14px `muted` |
| vencido | `prazo-vencido` (texto) / `prazo-vencido-dot` | `#946300` / `#F5A500` | "há 5 dias · prazo vencido", ícone `clock-alert` 14px `warning-ink` — segue o protótipo (âmbar, não vermelho) |

**Prioridade** (`PRIORITY_LABELS`). Sempre ponto + rótulo escrito.

| Prioridade | Token | Hex | Forma do ponto |
|---|---|---|---|
| Crítica | `prioridade-critica` | `#EE343B` | ponto cheio **[decisão: não há no protótipo]** |
| Alta | `prioridade-alta` | `#F5A500` | ponto cheio (protótipo) |
| Média | `prioridade-media` | `#1B243166` | ponto cheio (protótipo) |
| Baixa | `prioridade-baixa` | `#1B243166` | **anel** 6px, borda 1.5px, sem preenchimento **[decisão: diferencia de Média sem depender de cor]** |

**Confiança do agent** (`Confidence.level`). Medidor de 3 segmentos + rótulo escrito (ver `decision-trace.md`).

| Nível | Token | Segmento cheio | Texto | Fundo do badge | Segmentos cheios |
|---|---|---|---|---|---|
| alta (≥ 0,85) | `confianca-alta` | `#00BD6C` | `#00804A` | `#00BD6C14` | 3 de 3 |
| média (0,60–0,84) | `confianca-media` | `#F5A500` | `#946300` | `#F5A50018` | 2 de 3 |
| baixa (< 0,60) | `confianca-baixa` | `#EE343B` | `#C4161D` | `#EE343B12` | 1 de 3 |
| segmento vazio | `meter-track` | `#1B24311F` | — | — | — |

**Quem fala** (papéis de `MessageRole`).

| Papel | Chat do funcionário | Console |
|---|---|---|
| funcionário | bolha `bg-ink` texto branco, à direita | bolha `bg-surface` + `shadow-bubble`, à esquerda |
| agent | bolha `bg-surface` + contorno `border-subtle`, à esquerda, nome "Nexo Assist" | bolha `bg-bubble-agent`, à direita, nome + tag "IA" (`primary-tint` / `primary-ink`) |
| analista | bolha `bg-bubble-analyst`, à esquerda, nome + tag do nível **[decisão]** | bolha `bg-bubble-analyst`, à direita, nome + tag "Suporte N2" (`success-tint` / `success-ink`) |
| sistema | divisória com ícone (estilo "System" do console) **[decisão no chat]** | divisória com ícone (protótipo) |

**Avatares do console** (fundo / iniciais), atribuídos por hash estável do `employee.id` (índice = soma dos
códigos de caractere mod 7):

| # | Fundo | Iniciais |
|---|---|---|
| 0 | `#DCE9F7` | `#0062C4` |
| 1 | `#F6E3D3` | `#9A4A12` |
| 2 | `#E6E1F7` | `#5B3FC4` |
| 3 | `#DDF0E6` | `#1E7A4C` |
| 4 | `#F7E1E6` | `#A3324F` |
| 5 | `#E5E8EC` | `#3D4656` |
| 6 | `#FBEFD0` | `#8A6100` |

**Painel escuro do login** (texto sobre `ink`): branco com alfa — `#FFFFFF` (título), `#FFFFFFCC` (nome no preview),
`#FFFFFFA6` (corpo), `#FFFFFF8C` (eyebrow, rótulos), `#FFFFFF73` (passos do agent), `#FFFFFF14` (bolha do agent,
contorno do preview), `#FFFFFF1A` (divisórias), `#FFFFFF0A` (fundo do preview), `#FFFFFF24` (fundo do atalho ⌘↵).

### Contraste (AA conferido)
`muted #5B6472` sobre branco 6,0:1, sobre `surface-subtle` 5,6:1, sobre `surface-thread` 5,3:1 · `warning-ink` 5,2:1 ·
`danger-ink` 6,0:1 · `success-ink` 5,0:1 · `primary-ink` 5,5:1 · branco sobre `primary` 5,9:1. Todos ≥ 4,5:1.
Os pontos coloridos são sempre acompanhados de texto; não carregam informação sozinhos.

---

## 2. Tipografia

Duas famílias (já carregadas em `layout.tsx` via `next/font`): **Schibsted Grotesk** (`font-sans`, toda a interface)
e **Newsreader** (`font-serif`, só títulos de destaque do login e o título do estado vazio do chat).

| Token | Família | Tamanho / altura | Peso | Tracking | Onde |
|---|---|---|---|---|---|
| `text-display` | Newsreader | 54 / 56 | 400 | -1.2px | título do painel do login |
| `text-title` | Newsreader | 40 / 44 | 400 | -0.8px | "Entrar" |
| `text-stat` | Newsreader | 34 / normal | 400 | -0.6px | números do rodapé do login |
| `text-empty` **[decisão]** | Newsreader | 32 / 38 | 400 | -0.6px | título do estado vazio do chat |
| `text-heading` | Schibsted | 20 / normal | 700 | -0.3px | "Conversas" (console) |
| `text-card-title` | Schibsted | 18 / 23 | 600 | -0.2px | título do card de chamado/rascunho |
| `text-brand` | Schibsted | 17 / normal (login) · 16 (app) | 700 | -0.2px | "Nexo Assist" |
| `text-lead` | Schibsted | 16 / 25 | 400 | — | corpo do painel do login |
| `text-body-lg` | Schibsted | 15.5 / 23 | 400–600 | — | subtítulo do login, botão Entrar, nomes no console, título do painel |
| `text-body` | Schibsted | 14.5 / 21 (mensagens do funcionário e console) · 22 (mensagem do agent no chat) | 400–600 | — | mensagens, valores de campo, inputs |
| `text-ui` | Schibsted | 13.5 / normal · 20 em parágrafos | 400–600 | — | navegação, botões, opções, descrição de card |
| `text-meta` | Schibsted | 12.5 / normal | 400–600 | — | chips de ação, metadados, rótulos de campo, contador |
| `text-caption` | Schibsted | 12 / normal | 500–600 | — | nome do remetente e eventos de sistema no console, pílula "Hoje" |
| `text-micro` | Schibsted | 11.5 / normal | 400–500 | — | e-mail na sidebar, tags de status da lista, atalho de teclado |
| `text-tiny` | Schibsted | 11 / normal | 400–600 | — | horário da mensagem, tag "IA" |
| `text-badge` | Schibsted | 10 / normal | 700 | — | contador do rail |

Pesos usados: 400 `font-normal`, 500 `font-medium`, 600 `font-semibold`, 700 `font-bold`. Itálico só em "digitando…"
(não usado — ver console.md). Números de contadores e horários: `tabular-nums` **[decisão]**.

---

## 3. Espaçamento e layout

Escala usada no protótipo (px): 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64, 96, 200.
Todos via escala padrão (`n/4`).

Larguras estruturais (viram tokens nomeados):

| Token | px | Origem |
|---|---|---|
| `sidebar` | 232 | sidebar do chat (231.5 + borda) |
| `rail` | 64 | rail do console (63.5 + borda) |
| `conv-list` | 380 | lista de conversas (379.5 + borda) |
| `ticket-panel` | 340 | painel "Chamados do funcionário" |
| `topbar` | 64 | altura das barras superiores (63.5 + borda) |
| `chat-column` | 808 | coluna de mensagens do chat (1208 − 2×200) |
| `bubble-agent` | 600 | largura máx. da bolha do agent no chat |
| `bubble-user` | 520 | largura máx. da bolha do funcionário no chat |
| `bubble-console` | 420 | largura máx. das bolhas no console |
| `showcase` | 800 | painel escuro do login |
| `auth-form` | 380 | formulário do login |

Breakpoints **[decisão]**: padrão do Tailwind (`sm 640`, `md 768`, `lg 1024`, `xl 1280`) + `2xl 1440` redefinido
para casar com o protótipo. Specs descrevem 375px (base) e 1440px (`2xl`).

---

## 4. Raios

| Token | px | Uso | Classe |
|---|---|---|---|
| `tail` | 4 | canto "rabicho" das bolhas | `rounded-tl-tail`, `rounded-br-tail`… |
| `tag` | 6 | atalho ⌘↵, botão Enviar do chat, tag "IA", checkbox, toggle de senha | `rounded-tag` |
| `control` | 8 | inputs, botões, opções rápidas, itens de menu | `rounded-control` |
| `bubble` | 12 | bolhas, composer, item da lista, card "Desta conversa", painel de decisão | `rounded-bubble` |
| `card` | 16 | cards de chamado/rascunho/seleção, preview do login | `rounded-card` |
| `full` | 999 | pílulas, avatares, busca, filtros | `rounded-full` |

Bolhas: chat funcionário `rounded-bubble rounded-br-tail`; chat agent/analista `rounded-bubble rounded-tl-tail`;
console funcionário `rounded-bubble rounded-tl-tail` (1ª do grupo; seguintes `rounded-bubble`); console agent/analista
`rounded-bubble rounded-tr-tail`.

---

## 5. Sombras

| Token | Valor | Uso |
|---|---|---|
| `shadow-input` | `0 1px 2px #1B24310A` | input de e-mail |
| `shadow-button` | `0 1px 2px #1B24310D` | botão secundário (Editar/Ajustar) |
| `shadow-card` | `0 1px 2px #1B24310D, 0 6px 18px #1B24310A` | cards de chamado/rascunho/seleção |
| `shadow-primary` | `0 1px 2px #0062C433, 0 6px 16px #0062C426` | botão Entrar |
| `shadow-bubble` | `0 1px 2px #1B243112` | bolhas do console |
| `drop-shadow-soft` | `drop-shadow(0 1px 1px #1B24310D)` | botões "Devolver ao agent", "Ver todos" |
| `drop-shadow-rail` | `drop-shadow(0 1px 1px #1B24311A)` | item ativo do rail |
| `shadow-popover` **[decisão]** | `0 4px 12px #1B24311A, 0 1px 2px #1B24310D` | menus, toasts, diálogo |

Contornos do protótipo são `outline: 1px solid … ; outline-offset: -0.5px` (desenhados por dentro). No código use
`outline outline-1 -outline-offset-1 outline-border-*` (ou `ring-1 ring-inset`). Isso **não** é o anel de foco.

---

## 6. Foco, movimento e estados interativos **[decisão — o protótipo não define]**

- **Foco visível** em todo elemento interativo: `focus-visible:outline-2 focus-visible:outline-offset-2
  focus-visible:outline-primary`. Em inputs, o foco segue o protótipo (campo Senha): contorno 1.5px `primary`
  e ícone passa a `primary-ink`.
- **Hover**: botão primário `#0057AE` (`primary-hover`); secundário/ghost `bg-surface-subtle`; linha de lista
  `bg-surface-subtle`; opção rápida `bg-surface-subtle`.
- **Pressionado**: primário `#004C99` (`primary-active`).
- **Desabilitado**: `opacity-55` (mesmo valor do composer travado do protótipo), `cursor-not-allowed`.
- **Movimento**: chips entram com fade + 2px de subida em 150ms `ease-out`; painel de decisão abre em 200ms
  (altura + opacidade); cursor de streaming pisca a 1s. Com `prefers-reduced-motion: reduce`, tudo sem animação.

---

## 7. Bloco `@theme` (colar em `apps/web/src/app/globals.css`)

Mantém o `@theme inline` das fontes que já existe e acrescenta o resto.

```css
@import "tailwindcss";

@theme inline {
  --font-sans: var(--font-schibsted), system-ui, sans-serif;
  --font-serif: var(--font-newsreader), Georgia, serif;
}

@theme {
  /* Breakpoint do protótipo */
  --breakpoint-2xl: 1440px;

  /* Neutros */
  --color-ink: #1b2431;
  --color-ink-secondary: #3d4656;
  --color-muted: #5b6472;
  --color-surface: #ffffff;
  --color-surface-subtle: #f6f7f9;
  --color-surface-thread: #eef1f5;
  --color-border-subtle: #e6e8ec;
  --color-border-control: #1b24311f;
  --color-border-card: #1b243117;
  --color-divider-soft: #1b243114;
  --color-radio-off: #1b243133;
  --color-day-pill: #ffffffcc;
  --color-meter-track: #1b24311f;

  /* Primária */
  --color-primary: #0062c4;
  --color-primary-hover: #0057ae;
  --color-primary-active: #004c99;
  --color-primary-ink: #0069c7;
  --color-accent: #0285f7;
  --color-primary-tint: #0285f712;
  --color-primary-hover-row: #0062c40a;
  --color-brand-mark: #037af6;
  --color-bubble-agent: #e6effa;
  --color-bubble-analyst: #e3f4ea;
  --color-avatar-primary: #dce9f7;

  /* Famílias semânticas */
  --color-success: #00bd6c;
  --color-success-ink: #00804a;
  --color-success-tint: #00bd6c14;
  --color-warning: #f5a500;
  --color-warning-ink: #946300;
  --color-warning-tint: #f5a50018;
  --color-danger: #ee343b;
  --color-danger-ink: #c4161d;
  --color-danger-tint: #ee343b12;

  /* Status do chamado (ponto) */
  --color-status-aberto: #0285f7;
  --color-status-andamento: #0285f7;
  --color-status-aguardando: #f5a500;
  --color-status-voce: #0062c4;
  --color-status-aprovado: #00bd6c;
  --color-status-encerrado: #1b243140;

  /* Prazo */
  --color-prazo-ok: #5b6472;
  --color-prazo-vencido: #946300;
  --color-prazo-vencido-dot: #f5a500;

  /* Prioridade (ponto) */
  --color-prioridade-critica: #ee343b;
  --color-prioridade-alta: #f5a500;
  --color-prioridade-media: #1b243166;
  --color-prioridade-baixa: #1b243166;

  /* Confiança do agent */
  --color-confianca-alta: #00bd6c;
  --color-confianca-alta-ink: #00804a;
  --color-confianca-alta-tint: #00bd6c14;
  --color-confianca-media: #f5a500;
  --color-confianca-media-ink: #946300;
  --color-confianca-media-tint: #f5a50018;
  --color-confianca-baixa: #ee343b;
  --color-confianca-baixa-ink: #c4161d;
  --color-confianca-baixa-tint: #ee343b12;

  /* Quem fala */
  --color-role-agent: #0069c7;
  --color-role-agent-tint: #0285f712;
  --color-role-analyst: #00804a;
  --color-role-analyst-tint: #00bd6c14;

  /* Tipografia */
  --text-display: 54px;
  --text-display--line-height: 56px;
  --text-display--letter-spacing: -1.2px;
  --text-title: 40px;
  --text-title--line-height: 44px;
  --text-title--letter-spacing: -0.8px;
  --text-stat: 34px;
  --text-stat--line-height: normal;
  --text-stat--letter-spacing: -0.6px;
  --text-empty: 32px;
  --text-empty--line-height: 38px;
  --text-empty--letter-spacing: -0.6px;
  --text-heading: 20px;
  --text-heading--line-height: normal;
  --text-heading--letter-spacing: -0.3px;
  --text-card-title: 18px;
  --text-card-title--line-height: 23px;
  --text-card-title--letter-spacing: -0.2px;
  --text-brand: 16px;
  --text-brand--line-height: normal;
  --text-brand--letter-spacing: -0.2px;
  --text-lead: 16px;
  --text-lead--line-height: 25px;
  --text-body-lg: 15.5px;
  --text-body-lg--line-height: 23px;
  --text-body: 14.5px;
  --text-body--line-height: 21px;
  --text-ui: 13.5px;
  --text-ui--line-height: 20px;
  --text-meta: 12.5px;
  --text-meta--line-height: normal;
  --text-caption: 12px;
  --text-caption--line-height: normal;
  --text-micro: 11.5px;
  --text-micro--line-height: normal;
  --text-tiny: 11px;
  --text-tiny--line-height: normal;
  --text-badge: 10px;
  --text-badge--line-height: normal;

  /* Larguras estruturais (w-*, h-*) */
  --spacing-sidebar: 232px;
  --spacing-rail: 64px;
  --spacing-conv-list: 380px;
  --spacing-ticket-panel: 340px;
  --spacing-topbar: 64px;
  --spacing-showcase: 800px;

  /* Larguras máximas (max-w-*) */
  --container-chat-column: 808px;
  --container-bubble-agent: 600px;
  --container-bubble-user: 520px;
  --container-bubble-console: 420px;
  --container-auth-form: 380px;

  /* Raios */
  --radius-tail: 4px;
  --radius-tag: 6px;
  --radius-control: 8px;
  --radius-bubble: 12px;
  --radius-card: 16px;

  /* Sombras */
  --shadow-input: 0 1px 2px #1b24310a;
  --shadow-button: 0 1px 2px #1b24310d;
  --shadow-card: 0 1px 2px #1b24310d, 0 6px 18px #1b24310a;
  --shadow-primary: 0 1px 2px #0062c433, 0 6px 16px #0062c426;
  --shadow-bubble: 0 1px 2px #1b243112;
  --shadow-popover: 0 4px 12px #1b24311a, 0 1px 2px #1b24310d;
  --drop-shadow-soft: 0 1px 1px #1b24310d;
  --drop-shadow-rail: 0 1px 1px #1b24311a;

  /* Movimento */
  --animate-chip-in: chip-in 150ms ease-out both;
  --animate-caret: caret 1s steps(1) infinite;

  @keyframes chip-in {
    from { opacity: 0; transform: translateY(2px); }
    to { opacity: 1; transform: none; }
  }
  @keyframes caret {
    50% { opacity: 0; }
  }
}

body {
  font-family: var(--font-sans);
  color: var(--color-ink);
  background: var(--color-surface);
}

@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after { animation: none !important; transition: none !important; }
}
```

Observação: `text-brand` vale 16px no app; no login use `text-brand text-[17px]` (único lugar com 17px).
