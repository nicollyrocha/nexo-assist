# Anexo B — Dados de exemplo

> Orientação original: criar nossos próprios dados — alguns funcionários, de 5 a 10 artigos curtos para a
> central de ajuda e chamados em situações variadas (aberto, vencido, resolvido recentemente, de outros
> funcionários). Os seeds ficam no código (ver `database-specialist`); este arquivo guarda os exemplos dados.

## Artigos de exemplo
- **VPN com erro 809:** reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale
  apenas para Windows 10; no Windows 11, abra um chamado.
- **Horário do service desk:** de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.

## Chamados de exemplo

| Chamado | Título | Categoria | Prioridade | Status | Última atualização |
|---|---|---|---|---|---|
| INC-20311 | Notebook lento após atualização do Windows | Hardware | Média | Aguardando analista | Há 6 dias |
| REQ-10442 | Segundo monitor para home office | Hardware | Baixa | Aprovado | Há 1 semana |
| INC-20150 | Senha do SAP bloqueada | Acesso | Média | Resolvido | Há 4 dias |

## O que os seeds precisam cobrir
- 3–5 funcionários `@nexo.com.br` (pelo menos um com vários chamados e um sem nenhum) e 2 analistas (N1, N2).
- 5–10 artigos, incluindo os dois acima, cobrindo dúvidas comuns e casos que **exigem** chamado
  (ex.: VPN 809 no Windows 11).
- Chamados: aberto no prazo, **vencido** (INC-20311 com média há 6 dias), resolvido há ≤7 dias (reabrível —
  INC-20150), resolvido há >7 dias (não reabrível), requisição aprovada, chamados **parecidos** para testar
  duplicidade e chamados **de outros funcionários** para testar isolamento.
- Datas relativas a "agora" no momento do seed, para "há 6 dias" continuar verdadeiro.
