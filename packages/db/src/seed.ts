import {
  DecisionTrace,
  MessageBlock,
  confidenceLevel,
  type ConversationStatus,
  type Intent,
  type Outcome,
  type RuleId,
  type ToolName,
  type TraceAction,
  type TransferReason,
} from "@nexo/shared";
import { inArray } from "drizzle-orm";
import { traceRow, type Db } from "./repo";
import * as schema from "./schema";

// Conversas de exemplo para o console do analista (Tela 4): sem elas, "Para você" e "Minhas" ficam vazias
// num banco novo. Cobrem os quatro motivos de transferência do Anexo A (pedido, crítico, vencido, baixa
// confiança) + uma conversa já em atendimento. Os chamados citados existem no seed do serviço de chamados
// (apps/tickets/src/db/seed-data.ts) e são sempre do próprio funcionário da conversa.
//
// Idempotente: ids fixos (prefixo 5eed0000-…). Rodar de novo apaga só essas conversas (cascata leva
// mensagens e traces) e recria com datas relativas a `now`. Conversas reais nunca são tocadas.
// Ana Souza fica de fora de propósito: é a funcionária do roteiro de demonstração do README.

const MINUTE = 60_000;
const MODEL = "google/gemini-3.6-flash";

/** uuid fixo e válido: 5eed0000-0000-4000-8000-<kind><n>. kind 1 = conversa, 2 = mensagem, 3 = trace. */
const seedId = (kind: 1 | 2 | 3, n: number) =>
  `5eed0000-0000-4000-8000-${String(kind * 1_000_000 + n).padStart(12, "0")}`;

/** Ids das conversas do seed — é só isso que o seed apaga. */
export const SEED_CONVERSATION_IDS = [1, 2, 3, 4, 5].map((n) => seedId(1, n));

// Rótulos dos chips (iguais a ACTION_LABELS de packages/agent, que este pacote não importa).
const LABELS: Record<ToolName, string> = {
  search_help_center: "buscou na central de ajuda",
  list_my_tickets: "consultou seus chamados",
  get_ticket: "consultou o chamado",
  propose_new_ticket: "montou o rascunho do chamado",
  propose_ticket_update: "montou a atualização do chamado",
  confirm_pending_action: "registrou no sistema de chamados",
  transfer_to_analyst: "chamou um analista",
};

const TRANSFER_EVENT: MessageBlock = { kind: "event", text: "Conversa transferida para um analista do service desk" };

type ActionInput = Omit<TraceAction, "label" | "attempts"> & { attempts?: number };
type TraceInput = {
  understanding: string;
  intent: Intent;
  actions: ActionInput[];
  outcome: Outcome;
  score: number;
  confidenceReason: string;
  rationale: string;
  rules: [RuleId, string][];
  alternatives?: string[];
  tokens: { input: number; output: number; cacheRead: number };
};

type Turn =
  | { min: number; role: "funcionario"; text: string }
  | {
      min: number;
      role: "agent";
      text: string;
      /** Função quando o bloco depende do instante da mensagem (ex.: prazo do rascunho). */
      blocks?: MessageBlock[] | ((at: Date) => MessageBlock[]);
      trace: TraceInput;
    }
  | { min: number; role: "sistema"; text: string }
  | { min: number; role: "analista"; analystId: string; text: string };

type ConversationInput = {
  n: number;
  employeeId: string;
  status: Extract<ConversationStatus, "aguardando_atendente" | "em_atendimento">;
  transferReason: TransferReason;
  ticketId: string | null;
  summary: string;
  assignedAnalystId?: string;
  /** Minutos atrás da última mudança de status ("aguardando desde" / "assumida em"). */
  statusChangedMin: number;
  createdMin: number;
  turns: Turn[];
};

const CONVERSATIONS: ConversationInput[] = [
  {
    n: 1,
    employeeId: "emp-carla",
    status: "aguardando_atendente",
    transferReason: "pedido_do_funcionario",
    ticketId: "INC-20320",
    summary:
      "Carla (Comercial) está com a VPN caindo a cada 10 minutos desde ontem. Já existe o INC-20320 (Alta, aberto há cerca de 2 horas, ainda no prazo). Ela precisa enviar propostas a clientes hoje e pediu para falar com um analista.",
    statusChangedMin: 14,
    createdMin: 22,
    turns: [
      {
        min: 22,
        role: "funcionario",
        text: "Minha VPN continua caindo a cada 10 minutos e eu preciso mandar as propostas para os clientes ainda hoje. Tem alguma novidade do meu chamado?",
      },
      {
        min: 21,
        role: "agent",
        text: "Encontrei seu chamado **INC-20320 — VPN cai a cada 10 minutos**, aberto há cerca de 2 horas com prioridade Alta. Ele ainda está no prazo: o Suporte N1 tem até 4 horas úteis para a primeira resposta. Quer que eu acrescente no chamado que as propostas precisam sair hoje, ou prefere falar com um analista?",
        blocks: [{ kind: "quick_replies", options: ["Acrescentar no chamado", "Falar com um analista"] }],
        trace: {
          understanding: "A funcionária quer saber a situação do chamado da VPN, que continua caindo, e tem um compromisso hoje.",
          intent: "consultar_chamado",
          actions: [
            { tool: "list_my_tickets", inputSummary: "chamados abertos", outcome: "ok", resultSummary: "1 chamado aberto: INC-20320", durationMs: 420 },
          ],
          outcome: "respondeu",
          score: 0.92,
          confidenceReason: "Só há um chamado aberto e ele trata exatamente da VPN.",
          rationale: "Mostrei o chamado existente e o prazo em vez de abrir outro; ofereci complementar ou chamar um analista.",
          rules: [
            ["duplicidade", "Já existe chamado aberto sobre a VPN: não se abre outro."],
            ["prioridade", "Alta: prazo de 4 horas úteis, ainda não vencido."],
          ],
          alternatives: ["Não abri chamado novo: o INC-20320 já trata da VPN."],
          tokens: { input: 1840, output: 152, cacheRead: 1210 },
        },
      },
      { min: 15, role: "funcionario", text: "Prefiro falar com alguém agora, não posso perder esse prazo." },
      {
        min: 14,
        role: "agent",
        text: "Certo, Carla. Chamei um analista do service desk e enviei o resumo: VPN caindo a cada 10 minutos, chamado INC-20320 e as propostas que precisam sair hoje. Assim que alguém assumir, a conversa continua por aqui.",
        blocks: [TRANSFER_EVENT],
        trace: {
          understanding: "A funcionária pediu para falar com uma pessoa.",
          intent: "falar_com_analista",
          actions: [
            { tool: "transfer_to_analyst", inputSummary: "pedido_do_funcionario · INC-20320", outcome: "ok", resultSummary: "conversa na fila do service desk com o resumo", durationMs: 0 },
          ],
          outcome: "transferiu",
          score: 0.97,
          confidenceReason: "Pedido explícito de falar com um analista.",
          rationale: "O funcionário pediu: transferência imediata, levando o resumo e o chamado em foco.",
          rules: [["transferencia", "Anexo A, transferência (1): o funcionário pede."]],
          tokens: { input: 2105, output: 98, cacheRead: 1840 },
        },
      },
    ],
  },
  {
    n: 2,
    employeeId: "emp-bruno",
    status: "aguardando_atendente",
    transferReason: "caso_critico",
    ticketId: "INC-20330",
    summary:
      "Chamado crítico INC-20330 aberto agora: Sistema de expedição fora do ar no centro de distribuição. A equipe inteira do CD está sem emitir etiquetas e os caminhões estão parados aguardando carga.",
    statusChangedMin: 25,
    createdMin: 34,
    turns: [
      {
        min: 34,
        role: "funcionario",
        text: "O sistema de expedição parou no CD inteiro, ninguém consegue abrir. Os caminhões estão parados esperando etiqueta!",
      },
      {
        min: 33,
        role: "agent",
        text: "Isso é um caso crítico: o sistema está parado para a equipe toda do centro de distribuição. Montei o rascunho abaixo — confira e confirme para eu abrir agora.",
        blocks: (at) => [
          {
            kind: "draft",
            actionId: "seed-draft-bruno",
            draft: {
              type: "INC",
              title: "Sistema de expedição fora do ar no centro de distribuição",
              description:
                "O sistema de expedição não abre em nenhum computador do centro de distribuição; a equipe inteira está sem emitir etiquetas e os caminhões estão parados aguardando carga.",
              category: "software",
              priority: "critica",
              affected: "minha_equipe",
              priorityReason: "Algo parado para uma equipe inteira: prioridade Crítica, prazo de 1 hora.",
            },
            // Crítica: 1 hora corrida a partir do rascunho.
            dueAtPreview: new Date(at.getTime() + 60 * MINUTE).toISOString(),
          },
          { kind: "quick_replies", options: ["Confirmar", "Quero ajustar", "Cancelar"] },
        ],
        trace: {
          understanding: "O sistema de expedição está fora do ar para toda a equipe do centro de distribuição.",
          intent: "abrir_chamado",
          actions: [
            { tool: "list_my_tickets", inputSummary: "chamados abertos", outcome: "ok", resultSummary: "2 abertos: INC-20305 (impressora) e REQ-10450 (Power BI) — nenhum sobre expedição", durationMs: 510 },
            { tool: "search_help_center", inputSummary: "sistema de expedição não abre", outcome: "sem_resultado", resultSummary: "nenhum artigo sobre o sistema de expedição", durationMs: 380 },
            { tool: "propose_new_ticket", inputSummary: "INC · Software · Crítica · minha equipe", outcome: "ok", resultSummary: "rascunho aguardando confirmação", durationMs: 0 },
          ],
          outcome: "propos_rascunho",
          score: 0.88,
          confidenceReason: "Sistema parado para uma equipe inteira, sem chamado aberto sobre isso.",
          rationale: "Algo parou para uma equipe: incidente de Software com prioridade Crítica. Mostrei o rascunho antes de criar.",
          rules: [
            ["tipo", "Algo parou de funcionar: Incidente (INC)."],
            ["prioridade", "Crítica: algo parado para uma equipe; prazo de 1 hora."],
            ["duplicidade", "Nenhum chamado aberto do funcionário trata do sistema de expedição."],
            ["abertura", "Rascunho mostrado; só cria depois da confirmação."],
          ],
          alternatives: ["Não atualizei o INC-20305: é sobre a impressora do 3º andar, outro problema."],
          tokens: { input: 2310, output: 286, cacheRead: 1210 },
        },
      },
      { min: 26, role: "funcionario", text: "Confirmar" },
      {
        min: 25,
        role: "agent",
        text: "Pronto, abri o chamado **INC-20330** com prioridade Crítica (prazo de 1 hora).\n\nComo é um caso crítico, já chamei um analista do Suporte N2 para acompanhar agora.",
        blocks: [TRANSFER_EVENT],
        trace: {
          understanding: "O funcionário confirmou o rascunho do chamado crítico.",
          intent: "confirmar_rascunho",
          actions: [
            { tool: "confirm_pending_action", inputSummary: "criar rascunho confirmado", outcome: "ok", resultSummary: "criou INC-20330", durationMs: 3420, attempts: 2 },
            { tool: "transfer_to_analyst", inputSummary: "caso_critico", outcome: "ok", resultSummary: "transferência automática com INC-20330", durationMs: 0 },
          ],
          outcome: "transferiu",
          score: 0.95,
          confidenceReason: "Confirmação explícita de um rascunho já revisado.",
          rationale: "Criei o chamado só depois do \"Confirmar\". Por ser crítico, a transferência é automática.",
          rules: [
            ["abertura", "Criado após a confirmação do funcionário."],
            ["transferencia", "Anexo A, transferência (2): o caso é crítico."],
          ],
          tokens: { input: 2590, output: 74, cacheRead: 2310 },
        },
      },
    ],
  },
  {
    n: 3,
    employeeId: "emp-fabio",
    status: "aguardando_atendente",
    transferReason: "chamado_vencido",
    ticketId: "INC-20286",
    summary:
      "Fábio (Jurídico): o assinador digital não reconhece o token do certificado desde a troca do notebook. INC-20286 (Média) está aguardando analista há 8 dias, além do prazo de 3 dias úteis — vencido. Ele assina petições pelo computador de um colega.",
    statusChangedMin: 99,
    createdMin: 110,
    turns: [
      {
        min: 110,
        role: "funcionario",
        text: "O assinador digital ainda não reconhece meu token. Alguém está vendo isso? Já faz mais de uma semana.",
      },
      {
        min: 109,
        role: "agent",
        text: "Encontrei seu chamado **INC-20286 — Assinador digital não reconhece o token**. Ele está aguardando analista e a última atualização foi há 8 dias. Pela prioridade Média, o prazo é de 3 dias úteis, então ele está **vencido**. Quer que eu chame um analista agora para retomar o caso?",
        blocks: [{ kind: "quick_replies", options: ["Sim, chamar analista", "Não, só acompanhar"] }],
        trace: {
          understanding: "O funcionário quer saber do chamado do token do assinador digital, parado há mais de uma semana.",
          intent: "consultar_chamado",
          actions: [
            { tool: "list_my_tickets", inputSummary: "chamados abertos", outcome: "ok", resultSummary: "2 abertos: INC-20286 (assinador) e INC-20280 (notebook lento)", durationMs: 460 },
            { tool: "get_ticket", inputSummary: "INC-20286", outcome: "ok", resultSummary: "aguardando analista; última atualização há 8 dias; vencido", durationMs: 390 },
          ],
          outcome: "respondeu",
          score: 0.91,
          confidenceReason: "O chamado citado é o único sobre o assinador e o prazo já passou.",
          rationale: "Mostrei a situação e o vencimento. Chamado vencido é motivo de transferência: ofereci um analista.",
          rules: [
            ["prioridade", "Média: 3 dias úteis a partir da última atualização do analista; passou do prazo."],
            ["transferencia", "Anexo A, transferência (3): o chamado está vencido."],
          ],
          alternatives: ["Não abri chamado novo: o INC-20286 já trata do token."],
          tokens: { input: 1975, output: 168, cacheRead: 1210 },
        },
      },
      { min: 100, role: "funcionario", text: "Sim, chamar analista" },
      {
        min: 99,
        role: "agent",
        text: "Feito. Chamei um analista e enviei o resumo: token não reconhecido desde a troca do notebook, INC-20286 vencido e você assinando pelo computador de um colega. A conversa continua por aqui quando ele assumir.",
        blocks: [TRANSFER_EVENT],
        trace: {
          understanding: "O funcionário aceitou falar com um analista sobre o chamado vencido.",
          intent: "falar_com_analista",
          actions: [
            { tool: "transfer_to_analyst", inputSummary: "chamado_vencido · INC-20286", outcome: "ok", resultSummary: "conversa na fila do service desk com o resumo", durationMs: 0 },
          ],
          outcome: "transferiu",
          score: 0.96,
          confidenceReason: "Aceite explícito da oferta de transferência.",
          rationale: "Chamado vencido e o funcionário aceitou: transferido com o resumo e o chamado em foco.",
          rules: [["transferencia", "Anexo A, transferência (3): o chamado está vencido."]],
          tokens: { input: 2240, output: 91, cacheRead: 1975 },
        },
      },
    ],
  },
  {
    n: 4,
    employeeId: "emp-gabriela",
    status: "aguardando_atendente",
    transferReason: "baixa_confianca",
    ticketId: null,
    summary:
      "Gabriela (Pessoas) vê um aviso sobre \"permissão ou certificado\" ao entrar no sistema de folha desde ontem; o aviso some sozinho. Sem chamados abertos e sem artigo na central de ajuda. Dúvida do agent: não dá para saber se é Acesso (usuário) ou Software (certificado do sistema).",
    statusChangedMin: 41,
    createdMin: 42,
    turns: [
      {
        min: 42,
        role: "funcionario",
        text: "Desde ontem aparece um aviso estranho quando eu entro no sistema de folha, algo sobre permissão ou certificado, e depois some. Não sei se é com o meu usuário ou com o sistema.",
      },
      {
        min: 41,
        role: "agent",
        text: "Procurei na central de ajuda e nos seus chamados, mas não encontrei nada que explique esse aviso no sistema de folha. Pode ser a permissão do seu usuário ou o certificado do sistema, e eu não quero chutar.\n\nComo não tenho segurança sobre o melhor caminho, chamei um analista para assumir. Ele recebe o resumo desta conversa, então você não vai precisar repetir tudo.",
        blocks: [TRANSFER_EVENT],
        trace: {
          understanding: "Aviso intermitente sobre permissão ou certificado ao entrar no sistema de folha.",
          intent: "duvida",
          actions: [
            { tool: "search_help_center", inputSummary: "aviso permissão certificado sistema de folha", outcome: "ok", resultSummary: "KB-003 (senha da rede) — não cobre o sistema de folha", durationMs: 410 },
            { tool: "list_my_tickets", inputSummary: "chamados abertos", outcome: "sem_resultado", resultSummary: "nenhum chamado", durationMs: 350 },
            { tool: "transfer_to_analyst", inputSummary: "baixa_confianca", outcome: "ok", resultSummary: "transferência automática por baixa confiança", durationMs: 0 },
          ],
          outcome: "transferiu",
          score: 0.42,
          confidenceReason: "A mensagem não deixa claro se é Acesso (usuário) ou Software (certificado), e nenhum artigo cobre o sistema de folha.",
          rationale: "Sem segurança sobre categoria e caminho, transferir é melhor do que abrir um chamado mal classificado.",
          rules: [["transferencia", "Anexo A, transferência (4): o agent não tem segurança sobre o que fazer."]],
          alternatives: ["Não montei rascunho: sem saber se é Acesso ou Software, categoria e prioridade ficariam chutadas."],
          tokens: { input: 1890, output: 205, cacheRead: 1210 },
        },
      },
    ],
  },
  {
    n: 5,
    employeeId: "emp-diego",
    status: "em_atendimento",
    transferReason: "pedido_do_funcionario",
    ticketId: "INC-20290",
    assignedAnalystId: "ana-marina",
    summary:
      "Diego (Marketing): o Outlook voltou a pedir senha em loop no computador, mesmo sintoma do INC-20290 (resolvido há 2 dias, ainda reabrível). Já trocou a senha e reiniciou. Pediu para falar com um analista por ser a segunda vez.",
    statusChangedMin: 50,
    createdMin: 70,
    turns: [
      {
        min: 70,
        role: "funcionario",
        text: "O Outlook voltou a pedir senha sem parar, igual da outra vez. Já troquei a senha e reiniciei o computador.",
      },
      {
        min: 69,
        role: "agent",
        text: "Encontrei o **INC-20290 — Sem acesso ao e-mail após troca de senha**, resolvido há 2 dias com o mesmo sintoma. Como foi resolvido há menos de 7 dias, posso reabri-lo com o que você contou, em vez de abrir outro. Prefere que eu monte a reabertura ou quer falar com um analista?",
        blocks: [{ kind: "quick_replies", options: ["Reabrir o chamado", "Falar com um analista"] }],
        trace: {
          understanding: "O Outlook voltou a pedir senha em loop, mesmo problema de um chamado recente.",
          intent: "consultar_chamado",
          actions: [
            { tool: "list_my_tickets", inputSummary: "todos os chamados", outcome: "ok", resultSummary: "INC-20290 resolvido há 2 dias (reabrível)", durationMs: 440 },
            { tool: "search_help_center", inputSummary: "outlook pede senha em loop", outcome: "ok", resultSummary: "KB-003 (troca de senha) e KB-004 (e-mail no celular)", durationMs: 360 },
          ],
          outcome: "respondeu",
          score: 0.86,
          confidenceReason: "Mesmo sintoma do INC-20290, resolvido dentro da janela de reabertura.",
          rationale: "Problema repetido de chamado resolvido há ≤7 dias: reabrir em vez de duplicar.",
          rules: [
            ["reabertura", "Resolvido há até 7 dias pode ser reaberto."],
            ["duplicidade", "Não abrir chamado novo para o mesmo problema."],
          ],
          alternatives: ["Não sugeri o KB-003 de novo: ele já trocou a senha."],
          tokens: { input: 2015, output: 171, cacheRead: 1210 },
        },
      },
      { min: 64, role: "funcionario", text: "Prefiro falar com alguém, já é a segunda vez que isso acontece." },
      {
        min: 63,
        role: "agent",
        text: "Entendido, Diego. Chamei um analista e enviei o resumo com o INC-20290. Assim que alguém assumir, a conversa continua por aqui.",
        blocks: [TRANSFER_EVENT],
        trace: {
          understanding: "O funcionário pediu para falar com uma pessoa.",
          intent: "falar_com_analista",
          actions: [
            { tool: "transfer_to_analyst", inputSummary: "pedido_do_funcionario · INC-20290", outcome: "ok", resultSummary: "conversa na fila do service desk com o resumo", durationMs: 0 },
          ],
          outcome: "transferiu",
          score: 0.97,
          confidenceReason: "Pedido explícito de falar com um analista.",
          rationale: "O funcionário pediu: transferência imediata com o resumo e o chamado em foco.",
          rules: [["transferencia", "Anexo A, transferência (1): o funcionário pede."]],
          tokens: { input: 2280, output: 66, cacheRead: 2015 },
        },
      },
      { min: 50, role: "sistema", text: "Marina Alves assumiu · agent pausado" },
      {
        min: 48,
        role: "analista",
        analystId: "ana-marina",
        text: "Oi, Diego! Aqui é a Marina, do Suporte N1. Vi que o INC-20290 foi resolvido há dois dias com o mesmo sintoma. O pedido de senha acontece também no Outlook do celular ou só no computador?",
      },
      { min: 45, role: "funcionario", text: "Só no computador. No celular está normal." },
    ],
  },
];

export type AppSeed = {
  conversations: (typeof schema.conversations.$inferInsert)[];
  messages: (typeof schema.messages.$inferInsert)[];
  traces: (typeof schema.decisionTraces.$inferInsert)[];
};

/** Monta as linhas do seed com datas relativas a `now`. Traces e blocos passam pelos contratos zod. */
export function buildAppSeed(now: Date): AppSeed {
  const ago = (min: number) => new Date(now.getTime() - min * MINUTE);
  const seed: AppSeed = { conversations: [], messages: [], traces: [] };
  let messageN = 0;
  let traceN = 0;

  for (const c of CONVERSATIONS) {
    const conversationId = seedId(1, c.n);
    const lastMin = Math.min(...c.turns.map((t) => t.min));
    seed.conversations.push({
      id: conversationId,
      employeeId: c.employeeId,
      status: c.status,
      assignedAnalystId: c.assignedAnalystId ?? null,
      transferReason: c.transferReason,
      summary: c.summary,
      ticketId: c.ticketId,
      agentState: null,
      // Cada transição incrementa a versão: ativa → aguardando (1) → em_atendimento (2).
      version: c.status === "em_atendimento" ? 2 : 1,
      statusChangedAt: ago(c.statusChangedMin),
      createdAt: ago(c.createdMin),
      updatedAt: ago(lastMin),
    });

    for (const turn of c.turns) {
      const createdAt = ago(turn.min);
      const id = seedId(2, ++messageN);
      if (turn.role === "agent") {
        const traceId = seedId(3, ++traceN);
        const t = turn.trace;
        const trace = DecisionTrace.parse({
          id: traceId,
          conversationId,
          understanding: t.understanding,
          intent: t.intent,
          actions: t.actions.map((a) => ({ ...a, label: LABELS[a.tool], attempts: a.attempts ?? 1 })),
          outcome: t.outcome,
          confidence: { level: confidenceLevel(t.score), score: t.score, reason: t.confidenceReason },
          rationale: t.rationale,
          rulesApplied: t.rules.map(([rule, explanation]) => ({ rule, explanation })),
          alternativesDiscarded: t.alternatives ?? [],
          usage: {
            model: MODEL,
            inputTokens: t.tokens.input,
            outputTokens: t.tokens.output,
            cacheReadTokens: t.tokens.cacheRead,
            cacheWriteTokens: 0,
            latencyMs: 1200 + t.tokens.output * 6,
          },
          createdAt: createdAt.toISOString(),
        });
        const raw = typeof turn.blocks === "function" ? turn.blocks(createdAt) : (turn.blocks ?? []);
        const blocks = MessageBlock.array().parse(raw);
        seed.traces.push({ ...traceRow(conversationId, trace), createdAt });
        seed.messages.push({ id, conversationId, role: "agent", authorId: null, content: turn.text, blocks, traceId, createdAt });
      } else if (turn.role === "sistema") {
        seed.messages.push({
          id,
          conversationId,
          role: "sistema",
          authorId: null,
          content: turn.text,
          blocks: [{ kind: "event", text: turn.text }],
          createdAt,
        });
      } else {
        const authorId = turn.role === "analista" ? turn.analystId : c.employeeId;
        seed.messages.push({ id, conversationId, role: turn.role, authorId, content: turn.text, blocks: [], createdAt });
      }
    }
  }
  return seed;
}

/**
 * Recria as conversas de exemplo. Apaga só as do próprio seed (ids fixos); o resto do banco fica intacto.
 * Sem transação (o driver HTTP do Neon não tem transação interativa): se falhar no meio, rodar de novo conserta.
 */
export async function seedApp(db: Db, now = new Date()): Promise<AppSeed> {
  const data = buildAppSeed(now);
  await db.delete(schema.conversations).where(inArray(schema.conversations.id, SEED_CONVERSATION_IDS));
  await db.insert(schema.conversations).values(data.conversations);
  await db.insert(schema.messages).values(data.messages);
  await db.insert(schema.decisionTraces).values(data.traces);
  return data;
}
