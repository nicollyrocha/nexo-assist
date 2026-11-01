# Anexo A — Regras do service desk

> Fonte da verdade para o agent. Nada aqui pode ser contrariado nem complementado com regras inventadas.
> Interpretações necessárias para implementar estão em "Notas de implementação", marcadas como decisão nossa.

## Tipos de chamado
- **Incidente (INC):** algo parou ou não funciona.
- **Requisição (REQ):** pedido de acesso, equipamento ou software.

## Categorias
Acesso · Rede e VPN · Hardware · Software · E-mail · Outros

## Abertura
Todo chamado precisa de **título, descrição, tipo, categoria, prioridade e de quem é afetado**. O agent mostra um
rascunho e só cria ou atualiza o chamado **depois da confirmação do funcionário**.

## Sem duplicidade
Se já existe um chamado aberto sobre o mesmo problema, ele é **atualizado, não duplicado**. Chamados
**resolvidos há até 7 dias podem ser reabertos**.

## Transferência
Acontece quando:
1. o funcionário pede;
2. o caso é crítico;
3. o chamado está vencido;
4. o agent não tem segurança sobre o que fazer.

Leva um **resumo do caso**, e o agent **não responde** enquanto a conversa está com um analista.

## Privacidade
Informações de um chamado só podem ser passadas a **quem o abriu**.

## Escopo
Apenas assuntos de TI. Outros assuntos (RH, financeiro, facilities) são **redirecionados**.

## Prioridade e prazos
A prioridade combina o **impacto** (quantas pessoas são afetadas) e a **urgência** (se há um compromisso em
risco). O prazo vale para a **primeira resposta e para cada atualização**; passado o prazo, o chamado está
**vencido**.

| Prioridade | Quando usar | Prazo |
|---|---|---|
| Crítica | Algo parado para uma equipe ou para a empresa | 1 hora |
| Alta | Impede uma pessoa de trabalhar, ou há um compromisso no mesmo dia | 4 horas úteis |
| Média | Atrapalha, mas há alternativa | 3 dias úteis |
| Baixa | Pedidos e melhorias sem urgência | 5 dias úteis |

## Notas de implementação (decisões nossas — registrar em ADR)
- **Horário útil:** segunda a sexta, 8h–18h (artigo "Horário do service desk", Anexo B), fuso
  `America/Sao_Paulo`. Feriados fora do escopo do protótipo.
- **Crítica = 1 hora corrida** (plantão 24h para críticos, mesmo artigo).
- **Vencido:** `now > due_at`, onde `due_at` é recalculado a partir da última atualização do analista
  (primeira resposta ou cada atualização). Função pura, testada com casos de borda (sexta 17h, fim de semana).
- **Quem é afetado:** "só eu", "minha equipe", "a empresa toda" — alimenta o impacto.
- **Confiança baixa** (critério 4 de transferência) é sinalizada no `DecisionTrace` e filtrável no console.
