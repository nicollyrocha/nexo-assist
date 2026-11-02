# 0005 — Ícones com lucide-react

- Status: aceita
- Data: 2026-11-02

## Contexto
O protótipo (Pencil) usa os ícones do conjunto Lucide. A stack não inclui biblioteca de ícones.

## Decisão
Usar `lucide-react`: é o conjunto do próprio protótipo (fidelidade visual), importa ícone a ícone
(tree-shaking, sem peso extra) e entrega SVG acessível com `aria-hidden` por padrão.

## Alternativas consideradas
- SVG inline copiado do protótipo: zero dependência, mas dezenas de ícones duplicados à mão.

## Consequências
Uma dependência a mais no `apps/web`; ícones decorativos ficam com `aria-hidden` e botões só com ícone
recebem `aria-label`.
