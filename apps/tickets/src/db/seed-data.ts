import { computeDueAt, isOpenStatus } from "@nexo/shared";
import type { analysts, employees, helpArticles, ticketEvents, tickets } from "./schema";

// Dados de exemplo (Anexo B). Datas relativas a `now`, para "há 6 dias" continuar verdadeiro.
// Cobertura: aberto no prazo, vencido, resolvido há ≤7 dias (reabrível) e >7 dias (não reabrível),
// requisição aprovada, chamados de outros funcionários e um funcionário sem chamados.

type Seed = {
  employees: (typeof employees.$inferInsert)[];
  analysts: (typeof analysts.$inferInsert)[];
  tickets: (typeof tickets.$inferInsert)[];
  events: (typeof ticketEvents.$inferInsert)[];
  articles: (typeof helpArticles.$inferInsert)[];
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function buildSeed(now: Date): Seed {
  const ago = (ms: number) => new Date(now.getTime() - ms);

  type TicketInput = Omit<typeof tickets.$inferInsert, "dueAt" | "updatedAt"> & { updatedAt: Date };
  const ticket = (t: TicketInput): typeof tickets.$inferInsert => ({
    ...t,
    lastAnalystUpdateAt: t.lastAnalystUpdateAt ?? null,
    dueAt: isOpenStatus(t.status)
      ? computeDueAt(t.priority, t.lastAnalystUpdateAt ?? t.openedAt ?? t.updatedAt)
      : null,
  });

  return {
    employees: [
      { id: "emp-ana", name: "Ana Souza", email: "ana.souza@nexo.com.br", department: "Financeiro" },
      { id: "emp-carla", name: "Carla Mendes", email: "carla.mendes@nexo.com.br", department: "Comercial" },
      { id: "emp-bruno", name: "Bruno Tavares", email: "bruno.tavares@nexo.com.br", department: "Operações" },
      { id: "emp-diego", name: "Diego Ramos", email: "diego.ramos@nexo.com.br", department: "Marketing" },
      { id: "emp-fabio", name: "Fábio Nunes", email: "fabio.nunes@nexo.com.br", department: "Jurídico" },
      { id: "emp-gabriela", name: "Gabriela Rocha", email: "gabriela.rocha@nexo.com.br", department: "Pessoas" },
    ],
    analysts: [
      { id: "ana-rafael", name: "Rafael Lima", email: "rafael.lima@nexo.com.br", tier: "N2" },
      { id: "ana-juliana", name: "Juliana Costa", email: "juliana.costa@nexo.com.br", tier: "N1" },
      { id: "ana-marina", name: "Marina Alves", email: "marina.alves@nexo.com.br", tier: "N1" },
      { id: "ana-thiago", name: "Thiago Pereira", email: "thiago.pereira@nexo.com.br", tier: "N2" },
    ],
    tickets: [
      // Ana: 3 abertos (1 vencido) e 2 resolvidos, como no protótipo.
      ticket({
        id: "INC-20311",
        type: "INC",
        title: "Notebook lento após atualização do Windows",
        description:
          "Depois da atualização do Windows de 16/10 o notebook demora vários minutos para abrir planilhas e o Teams trava. Já reiniciou duas vezes.",
        category: "hardware",
        priority: "media",
        affected: "so_eu",
        status: "aguardando_analista",
        requesterId: "emp-ana",
        assignedTeam: "Suporte N1",
        openedAt: ago(16 * DAY),
        updatedAt: ago(6 * DAY),
        lastAnalystUpdateAt: ago(6 * DAY),
      }),
      ticket({
        id: "REQ-10442",
        type: "REQ",
        title: "Segundo monitor para home office",
        description: "Pedido de um segundo monitor para trabalhar em casa com planilhas lado a lado.",
        category: "hardware",
        priority: "baixa",
        affected: "so_eu",
        status: "aprovado",
        requesterId: "emp-ana",
        assignedTeam: "Suporte N1",
        openedAt: ago(10 * DAY),
        updatedAt: ago(7 * DAY),
        lastAnalystUpdateAt: ago(7 * DAY),
      }),
      ticket({
        id: "INC-20298",
        type: "INC",
        title: "Acesso à pasta Financeiro",
        description: "Perdeu o acesso de escrita à pasta compartilhada Financeiro/Fechamento após a migração do servidor.",
        category: "acesso",
        priority: "media",
        affected: "so_eu",
        status: "em_andamento",
        requesterId: "emp-ana",
        assignedTeam: "Suporte N2",
        openedAt: ago(2 * DAY),
        updatedAt: ago(4 * HOUR),
        lastAnalystUpdateAt: ago(4 * HOUR),
      }),
      ticket({
        id: "INC-20150",
        type: "INC",
        title: "Senha do SAP bloqueada",
        description: "Senha do SAP bloqueada após tentativas erradas.",
        category: "acesso",
        priority: "media",
        affected: "so_eu",
        status: "resolvido",
        requesterId: "emp-ana",
        assignedTeam: "Suporte N1",
        openedAt: ago(5 * DAY),
        updatedAt: ago(4 * DAY),
        lastAnalystUpdateAt: ago(4 * DAY),
        resolvedAt: ago(4 * DAY),
      }),
      ticket({
        id: "INC-19877",
        type: "INC",
        title: "Outlook não sincroniza no celular",
        description: "E-mails não aparecem no aplicativo Outlook do celular corporativo.",
        category: "email",
        priority: "baixa",
        affected: "so_eu",
        status: "resolvido",
        requesterId: "emp-ana",
        assignedTeam: "Suporte N1",
        openedAt: ago(62 * DAY),
        updatedAt: ago(58 * DAY),
        lastAnalystUpdateAt: ago(58 * DAY),
        resolvedAt: ago(58 * DAY),
      }),
      // Outros funcionários — servem também para testar que nada vaza entre pessoas.
      ticket({
        id: "INC-20320",
        type: "INC",
        title: "VPN cai a cada 10 minutos",
        description: "Conexão da VPN cai repetidamente desde ontem; precisa enviar propostas hoje.",
        category: "rede_vpn",
        priority: "alta",
        affected: "so_eu",
        status: "aberto",
        requesterId: "emp-carla",
        assignedTeam: "Suporte N1",
        openedAt: ago(2 * HOUR),
        updatedAt: ago(2 * HOUR),
      }),
      ticket({
        id: "INC-20305",
        type: "INC",
        title: "Impressora do 3º andar não imprime",
        description: "Trabalhos ficam presos na fila da impressora do 3º andar.",
        category: "hardware",
        priority: "media",
        affected: "minha_equipe",
        status: "aberto",
        requesterId: "emp-bruno",
        assignedTeam: "Suporte N1",
        openedAt: ago(1 * DAY),
        updatedAt: ago(1 * DAY),
      }),
      ticket({
        id: "REQ-10450",
        type: "REQ",
        title: "Licença do Power BI Pro",
        description: "Licença para publicar relatórios de operações.",
        category: "software",
        priority: "baixa",
        affected: "so_eu",
        status: "aberto",
        requesterId: "emp-bruno",
        assignedTeam: "Suporte N1",
        openedAt: ago(3 * DAY),
        updatedAt: ago(3 * DAY),
      }),
      ticket({
        id: "INC-20290",
        type: "INC",
        title: "Sem acesso ao e-mail após troca de senha",
        description: "Outlook pede senha em loop após a troca obrigatória.",
        category: "email",
        priority: "alta",
        affected: "so_eu",
        status: "resolvido",
        requesterId: "emp-diego",
        assignedTeam: "Suporte N1",
        openedAt: ago(3 * DAY),
        updatedAt: ago(2 * DAY),
        lastAnalystUpdateAt: ago(2 * DAY),
        resolvedAt: ago(2 * DAY),
      }),
      ticket({
        id: "INC-20280",
        type: "INC",
        title: "Notebook lento ao abrir o navegador",
        description: "Navegador leva mais de um minuto para abrir.",
        category: "hardware",
        priority: "media",
        affected: "so_eu",
        status: "aguardando_funcionario",
        requesterId: "emp-fabio",
        assignedTeam: "Suporte N1",
        openedAt: ago(4 * DAY),
        updatedAt: ago(1 * DAY),
        lastAnalystUpdateAt: ago(1 * DAY),
      }),
      // Usados pelas conversas de exemplo do console (packages/db/src/seed.ts):
      // um vencido de outro funcionário (8 dias sem atualização > 3 dias úteis) e um crítico recém-aberto.
      ticket({
        id: "INC-20286",
        type: "INC",
        title: "Assinador digital não reconhece o token",
        description:
          "O assinador digital não reconhece o token do certificado desde a troca do notebook. Está assinando petições pelo computador de um colega.",
        category: "software",
        priority: "media",
        affected: "so_eu",
        status: "aguardando_analista",
        requesterId: "emp-fabio",
        assignedTeam: "Suporte N1",
        openedAt: ago(12 * DAY),
        updatedAt: ago(8 * DAY),
        lastAnalystUpdateAt: ago(8 * DAY),
      }),
      ticket({
        id: "INC-20330",
        type: "INC",
        title: "Sistema de expedição fora do ar no centro de distribuição",
        description:
          "O sistema de expedição não abre em nenhum computador do centro de distribuição; a equipe inteira está sem emitir etiquetas e os caminhões estão parados aguardando carga.",
        category: "software",
        priority: "critica",
        affected: "minha_equipe",
        status: "aberto",
        requesterId: "emp-bruno",
        assignedTeam: "Suporte N2",
        openedAt: ago(25 * MINUTE),
        updatedAt: ago(25 * MINUTE),
      }),
    ],
    events: [
      { ticketId: "INC-20311", kind: "comentario", authorKind: "funcionario", authorId: "emp-ana", body: "Continua lento, principalmente pela manhã.", createdAt: ago(9 * DAY) },
      { ticketId: "INC-20311", kind: "status", authorKind: "analista", authorId: "ana-juliana", body: "Encaminhado para análise de desempenho. Aguardando analista.", createdAt: ago(6 * DAY) },
      { ticketId: "REQ-10442", kind: "status", authorKind: "analista", authorId: "ana-juliana", body: "Requisição aprovada pelo gestor. Monitor em separação.", createdAt: ago(7 * DAY) },
      { ticketId: "INC-20298", kind: "comentario", authorKind: "analista", authorId: "ana-rafael", body: "Permissões sendo replicadas no novo servidor.", createdAt: ago(4 * HOUR) },
      { ticketId: "INC-20150", kind: "status", authorKind: "analista", authorId: "ana-juliana", body: "Senha desbloqueada e redefinida.", createdAt: ago(4 * DAY) },
      { ticketId: "INC-20286", kind: "status", authorKind: "analista", authorId: "ana-juliana", body: "Driver do token reinstalado; aguardando análise do certificado.", createdAt: ago(8 * DAY) },
    ],
    articles: [
      {
        id: "KB-001",
        title: "VPN com erro 809",
        body: "Reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.",
        category: "rede_vpn",
      },
      {
        id: "KB-002",
        title: "Horário do service desk",
        body: "De segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
        category: "outros",
      },
      {
        id: "KB-003",
        title: "Como trocar ou desbloquear a senha da rede",
        body: "Acesse o portal de autoatendimento de senhas, confirme sua identidade pelo celular cadastrado e defina a nova senha. A nova senha vale para rede, e-mail e VPN. Senhas de sistemas como o SAP não são desbloqueadas pelo portal: abra um chamado de Acesso.",
        category: "acesso",
      },
      {
        id: "KB-004",
        title: "Configurar o e-mail corporativo no celular",
        body: "Instale o aplicativo Outlook, entre com o e-mail corporativo e aprove o acesso no aplicativo autenticador. Se os e-mails não sincronizarem, remova a conta e adicione de novo.",
        category: "email",
      },
      {
        id: "KB-005",
        title: "Instalar programas pelo portal de softwares",
        body: "Programas homologados podem ser instalados pelo portal de softwares, sem chamado. Programas pagos ou fora do catálogo precisam de uma requisição de Software com a aprovação do gestor.",
        category: "software",
      },
      {
        id: "KB-006",
        title: "Adicionar a impressora do andar",
        body: "Em Configurações > Impressoras, escolha Adicionar e selecione a impressora com o número do seu andar. Se os trabalhos ficarem presos na fila, reinicie o spooler pelo portal de softwares em Ferramentas.",
        category: "hardware",
      },
      {
        id: "KB-007",
        title: "Notebook lento após atualização",
        body: "Deixe o notebook ligado e conectado à energia por 30 minutos para concluir as atualizações, reinicie e libere espaço em disco pelo portal de softwares em Limpeza. Se continuar lento, abra um chamado de Hardware.",
        category: "hardware",
      },
      {
        id: "KB-008",
        title: "Wi-Fi corporativo",
        body: "Conecte-se à rede Nexo-Corp com seu usuário e senha da rede. A rede Nexo-Visitantes é só para convidados e não acessa sistemas internos.",
        category: "rede_vpn",
      },
    ],
  };
}
