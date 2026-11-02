# Tela 1 — Login

Referência: `docs/anexos/C-prototipo/tela-1-login.{png,html}`. Tokens em `tokens.md`.
Contrato: `POST /api/auth/login` (`LoginInput` → `LoginResponse` | 401 `invalid_credentials`). Rota `/login`.
Funcionário vai para `/chat`, analista para `/console` (`redirectTo` da resposta).

## Anatomia (1440 × 900)

```
┌──────────── Showcase 800px (bg-ink) ───────────┬──────── Sign In (flex-1) ────────┐
│ [mark] Nexo Assist                              │       Problema para entrar? Ligue │
│                                                 │                                   │
│ Service desk de TI da Nexo                      │        Entrar                     │
│ Seu problema de TI, resolvido em uma conversa.  │        Use seu e-mail…            │
│ Descreva o que está acontecendo…                │        [E-mail corporativo]       │
│        ┌ preview de conversa 500px ┐            │        [Senha]   Esqueci…         │
│        └───────────────────────────┘            │        [x] Manter conectado       │
│ ─────────────────────────────────────────────── │        [ Entrar → ]               │
│ 1 h           │ 4 h úteis      │ Seg–sex 8h–18h │        ──── nota de demo ────     │
│ prazo crít…   │ resposta…      │ horário…       │ © 2026 Nexo…   Privacidade…       │
└─────────────────────────────────────────────────┴───────────────────────────────────┘
```

### Showcase (`aside`, decorativo, `aria-hidden` no preview)
- `w-showcase h-full bg-ink flex flex-col justify-between pt-10 px-16 pb-12`.
- **Brand**: `flex items-center gap-2.5`; símbolo 24px fill `#FFFFFF`; "Nexo Assist" `text-[17px] font-bold tracking-[-0.2px] text-white`.
- **Story**: `flex flex-col gap-9`.
  - Headline `flex flex-col gap-4.5`: eyebrow "Service desk de TI da Nexo" `text-ui font-medium text-white/55`
    (`#FFFFFF8C`); título `font-serif text-display text-white` (é o `h2` visual; o `h1` da página é "Entrar");
    corpo `text-lead text-white/65 max-w-[520px]`.
  - Preview (`pl-24`): caixa `w-[500px] p-4.5 gap-2.5 bg-white/4 outline-1 outline-white/8 rounded-card`.
    - Bolha usuário: `py-2.25 px-3.5 bg-white rounded-bubble rounded-br-tail text-ui text-ink`.
    - Agent: `gap-1.5`; linha "Nexo Assist" `text-meta font-semibold text-white/80` + passos `text-meta text-white/45`;
      bolha `w-[380px] py-2.5 px-3.5 bg-white/8 rounded-bubble rounded-tl-tail text-ui/20 text-white`;
      chip do chamado `py-1.75 px-3 gap-2 bg-white rounded-bubble`: ponto 7px `prioridade-alta`, número
      `text-meta font-semibold text-ink`, meta `text-meta text-muted`.
- **Stats** (`border-t border-white/10 pt-6`, 3 colunas `flex-1`, 2ª e 3ª com `border-l border-white/10 pl-6`):
  valor `font-serif text-stat text-white`, rótulo `text-ui text-white/55`, `gap-1.5`.

### Sign In (`main`)
- `flex-1 h-full flex flex-col justify-between py-10 px-14`.
- **Ajuda** (topo, à direita, `gap-1.5`): "Problema para entrar?" `text-ui text-muted` + link "Ligue no ramal 4000"
  `text-ui font-semibold text-primary-ink` (`href="tel:4000"`).
- **Form** centralizado, `w-full max-w-auth-form flex flex-col gap-7`:
  - Heading `gap-2`: `h1` "Entrar" `font-serif text-title text-ink`; subtítulo `text-body-lg text-muted`.
  - Campos `gap-4.5`; cada campo `gap-2`:
    - Linha do rótulo `flex justify-between`: `label` `text-ui font-medium text-ink`; no campo Senha, link
      "Esqueci minha senha" `text-ui font-medium text-primary-ink`.
    - Input: `h-11 pl-3.5 pr-2 gap-2.5 bg-surface rounded-control outline-1 outline-border-control shadow-input`;
      ícone 16px (`mail`, `lock-keyhole`) `text-muted`; texto `text-[14.5px] text-ink`.
      Senha: texto com `tracking-[2px]` quando mascarado; botão olho `size-7.5 rounded-tag` (ícone `eye`/`eye-off` 16px).
  - "Manter conectado neste computador": checkbox 18px `rounded-tag`, marcado `bg-primary` com `check` 12px branco;
    rótulo `text-ui text-ink-secondary`; `gap-2.25 pt-0.5`.
  - Botão **Entrar**: `h-11 w-full gap-2 bg-primary rounded-control shadow-primary`; rótulo `text-body-lg font-semibold
    text-white` + `arrow-right` 16px.
  - Nota (`border-t border-border-subtle pt-4`): ver "Textos".
- **Rodapé** `flex justify-between text-meta text-muted`: "© 2026 Nexo · Service desk de TI" · link "Privacidade e uso de dados".

## Estados

| Estado | Visual | Comportamento |
|---|---|---|
| Padrão | como protótipo; e-mail vazio com placeholder `nome.sobrenome@nexo.com.br` (`text-muted`) | foco inicial no e-mail (`autoFocus`) |
| Foco no campo | contorno `1.5px primary` (`outline-[1.5px] outline-primary`), ícone `text-primary-ink`, sem `shadow-input` | — |
| Erro de campo | contorno `1.5px danger`, ícone `danger-ink`; mensagem abaixo `text-meta text-danger-ink` com `circle-alert` 14px, `gap-1.5`, `mt-0.5` | validação no submit e no blur depois do 1º submit; `aria-invalid="true"` + `aria-describedby` |
| Enviando | botão com spinner 16px no lugar da seta, rótulo "Entrando…", `aria-busy`; campos `readOnly` | evita duplo envio |
| Credencial inválida (401) | alerta acima do botão: `p-3 gap-2.5 rounded-control bg-danger-tint text-ui text-danger-ink`, ícone `circle-alert` 16px | `role="alert"`; foco volta para o e-mail; senha não é apagada |
| Falha do servidor (5xx/rede) | mesmo alerta, cor `warning` (`bg-warning-tint text-warning-ink`) | botão volta ao normal |
| Sessão expirada (vindo de 401 em outra tela, `?motivo=sessao`) | alerta informativo `bg-primary-tint text-primary-ink`, ícone `info` | — |
| "Esqueci minha senha" | popover `w-72 p-3.5 rounded-bubble bg-surface shadow-popover text-ui` | `aria-expanded`; fecha com Esc/clique fora |

## Textos finais (pt-BR)

- Eyebrow: "Service desk de TI da Nexo"
- Título showcase: "Seu problema de TI, resolvido em uma conversa."
- Corpo: "Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um analista quando precisa."
- Preview: "Meu notebook não conecta na VPN. Erro 809." / "consultou seus chamados · montou o rascunho" /
  "Montei o chamado com prioridade alta. Confira e confirme para eu criar." / chip "Rascunho · Rede e VPN · Alta · resposta em até 4 h úteis"
  **[decisão: o preview original dizia "criou um chamado" sem confirmação — contradiz a regra de abertura]**
- Stats **[decisão: trocadas por fatos do Anexo A/B, em vez de métricas inventadas]**:
  "1 h" / "prazo para casos críticos" · "4 h úteis" / "resposta para prioridade alta" · "Seg–sex, 8h–18h" / "horário do service desk"
  (sem o ponto "online"; o terceiro valor em `text-stat` cabe em 1 linha a 1440px).
- "Problema para entrar?" "Ligue no ramal 4000"
- "Entrar" / "Use seu e-mail corporativo e a senha da rede Nexo."
- Rótulos: "E-mail corporativo", "Senha", "Esqueci minha senha", "Manter conectado neste computador"
- Botão: "Entrar" · enviando: "Entrando…"
- Botão olho: `aria-label` "Mostrar senha" / "Ocultar senha"
- Popover senha: "Para trocar a senha da rede, ligue no ramal 4000 ou fale com o service desk."
- Nota (demo) **[decisão: o protótipo deixa a nota vazia]**: "Ambiente de demonstração: entre com um e-mail dos dados de exemplo e qualquer senha."
- Erros:
  - vazio: "Informe seu e-mail corporativo." / "Informe sua senha."
  - formato: "Esse e-mail não parece válido. Exemplo: nome.sobrenome@nexo.com.br"
  - 401: "Não encontramos esse e-mail. Confira se é o seu e-mail corporativo da Nexo."
  - servidor: "Não conseguimos entrar agora. Tente de novo em alguns segundos."
  - sessão: "Sua sessão terminou. Entre de novo para continuar."
- Rodapé: "© 2026 Nexo · Service desk de TI", "Privacidade e uso de dados"

## Responsivo

- **≥ 1440 (`2xl`)**: como protótipo.
- **1024–1439**: showcase `w-1/2` com `px-12`; título `text-[44px]/[48px]`; preview sem `pl-24` (`pl-0`), `w-full max-w-[500px]`.
- **< 1024**: showcase oculto (`hidden lg:flex`). Topo do `main` mostra o brand (símbolo `brand-mark` 20px + "Nexo Assist"
  `text-brand text-ink`) à esquerda e a ajuda à direita.
- **375px**: `main` `px-6 py-6`; form `max-w-none`; título "Entrar" `text-[34px]/[38px]`; ajuda vira uma linha abaixo do
  botão Entrar ("Problema para entrar? Ligue no ramal 4000", centralizada); rodapé empilhado (`flex-col gap-1`).
  Inputs mantêm 44px de altura (alvo de toque).

## Acessibilidade

- `h1` "Entrar"; `form` com `aria-labelledby` do h1; `label for` em cada campo; `autocomplete="username"` / `"current-password"`;
  `type="email"` com `inputmode="email"`.
- Ordem de tab: ajuda (ramal) → e-mail → esqueci senha → senha → mostrar senha → manter conectado → Entrar → privacidade.
  **[decisão]** "Esqueci minha senha" fica antes do campo Senha no DOM, como no layout.
- Showcase: `aside` com o texto legível por leitor de tela; o preview de conversa é ilustração (`aria-hidden="true"`).
- Erros anunciados com `role="alert"`; erro de campo ligado por `aria-describedby`.
- Foco visível padrão (`tokens.md` §6); não remover o contorno do checkbox no foco.
