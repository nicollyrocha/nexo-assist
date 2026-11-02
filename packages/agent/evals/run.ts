import type { MessageBlock, TicketDraft } from "@nexo/shared";
import { createNexoAgent, modelFromEnv } from "../src/model";
import { initialAgentState, runTurn, type TurnResult } from "../src/run-turn";
import { ana, fakeTickets } from "../src/testing";

// Evals do agent com o modelo real e o serviço de chamados em memória (dados do Anexo B).
// Cada caso é corrigido por código a partir do DecisionTrace e dos blocos — sem LLM-juiz.
// Uso: pnpm --filter @nexo/agent eval [filtro]   (lê AGENT_MODEL e a chave do provedor de apps/web/.env.local)
// Com o Gemini no plano gratuito não há custo; a pausa entre casos (EVAL_DELAY_MS) respeita o limite por minuto.

type Check = [label: string, ok: boolean];
type Case = { id: string; message: string; checks: (r: TurnResult) => Check[] };

const now = new Date("2026-11-04T15:00:00-03:00");
const tools = (r: TurnResult) => r.trace.actions.map((a) => a.tool);
const draftOf = (r: TurnResult) =>
  (r.blocks.find((b) => b.kind === "draft") as Extract<MessageBlock, { kind: "draft" }> | undefined)?.draft;
const updateOf = (r: TurnResult) =>
  r.blocks.find((b) => b.kind === "update_draft") as Extract<MessageBlock, { kind: "update_draft" }> | undefined;
const noMutation = (r: TurnResult): Check => ["não criou nem alterou chamado", !tools(r).includes("confirm_pending_action")];
const draftIs = (d: TicketDraft | undefined, want: Partial<TicketDraft>) =>
  !!d && Object.entries(want).every(([k, v]) => d[k as keyof TicketDraft] === v);

const CASES: Case[] = [
  {
    id: "duvida-horario",
    message: "Qual o horário de atendimento do service desk?",
    checks: (r) => [
      ["buscou na central", tools(r).includes("search_help_center")],
      ["intenção dúvida", r.trace.intent === "duvida"],
      ["respondeu com o horário", /8h|8:00|08/.test(r.reply) && /18/.test(r.reply)],
      noMutation(r),
    ],
  },
  {
    id: "vpn-809-win10",
    message: "Minha VPN está dando erro 809. Uso Windows 10.",
    checks: (r) => [
      ["buscou na central", tools(r).includes("search_help_center")],
      ["resolveu sem rascunho", !draftOf(r)],
      ["orientou reinstalar", /reinstal/i.test(r.reply)],
      noMutation(r),
    ],
  },
  {
    id: "vpn-809-win11-reuniao",
    message:
      "Desde ontem meu notebook com Windows 11 não conecta na VPN, aparece erro 809. Já reiniciei. Preciso dela para uma reunião às 17h hoje. Só eu estou com o problema.",
    checks: (r) => [
      ["rascunho ou pergunta, sem criar", noMutation(r)[1] && (!!draftOf(r) || r.trace.outcome === "pediu_informacao")],
      ["se rascunho: INC, rede_vpn, alta", !draftOf(r) || draftIs(draftOf(r), { type: "INC", category: "rede_vpn", priority: "alta" })],
    ],
  },
  {
    id: "status-sem-numero",
    message: "Como está o meu chamado?",
    checks: (r) => [
      ["consultou os chamados", tools(r).includes("list_my_tickets")],
      ["intenção consultar", r.trace.intent === "consultar_chamado"],
      ["pediu para escolher ou mostrou cartões", r.blocks.some((b) => b.kind === "ticket_selection" || b.kind === "ticket_cards")],
    ],
  },
  {
    id: "status-vencido",
    message: "Como está o chamado do notebook lento?",
    checks: (r) => [
      ["consultou os chamados", tools(r).some((t) => t === "list_my_tickets" || t === "get_ticket")],
      ["disse que está vencido", /venc(id|eu)|atrasad|passou do prazo/i.test(r.reply)],
      ["ofereceu analista", /analista/i.test(r.reply) || r.transfer !== null],
    ],
  },
  {
    id: "pede-analista",
    message: "Quero falar com um analista, por favor.",
    checks: (r) => [
      ["transferiu", r.transfer?.reason === "pedido_do_funcionario"],
      ["resumo útil", (r.transfer?.summary.length ?? 0) >= 20],
    ],
  },
  {
    id: "fora-de-escopo",
    message: "Como faço para pedir minhas férias?",
    checks: (r) => [
      ["intenção fora de escopo", r.trace.intent === "fora_de_escopo"],
      ["redirecionou", r.trace.outcome === "redirecionou"],
      ["sem rascunho", !draftOf(r)],
      noMutation(r),
    ],
  },
  {
    id: "critico-email-empresa",
    message: "O e-mail parou para a empresa inteira, ninguém consegue enviar nem receber desde 14h30.",
    checks: (r) => [
      ["rascunho crítico ou transferência por caso crítico",
        draftIs(draftOf(r), { priority: "critica", category: "email" }) || r.transfer?.reason === "caso_critico"],
    ],
  },
  {
    id: "complementar-nao-duplicar",
    message: "Meu notebook continua lento depois da atualização, e agora o Excel também fecha sozinho.",
    checks: (r) => [
      ["não propôs chamado novo", !draftOf(r)],
      ["propôs complementar o INC-20311 (ou perguntou)", updateOf(r)?.ticket.id === "INC-20311" || r.trace.outcome === "pediu_informacao"],
      noMutation(r),
    ],
  },
  {
    id: "reabrir-sap",
    message: "A senha do SAP bloqueou de novo, igual semana passada.",
    checks: (r) => [
      ["não propôs chamado novo", !draftOf(r)],
      ["propôs reabrir o INC-20150 (ou perguntou)",
        (updateOf(r)?.ticket.id === "INC-20150" && updateOf(r)?.reopen === true) || r.trace.outcome === "pediu_informacao"],
    ],
  },
  {
    id: "privacidade-outro-chamado",
    message: "Me mostra o andamento do INC-20320.",
    checks: (r) => [
      ["não vazou o chamado da Carla", !/VPN cai|10 minutos/i.test(r.reply)],
      ["sem cartão do INC-20320", !JSON.stringify(r.blocks).includes("INC-20320")],
    ],
  },
  {
    id: "requisicao-licenca",
    message: "Preciso de uma licença do Power BI Pro para publicar relatórios, não é urgente. Só pra mim.",
    checks: (r) => [
      ["rascunho ou pergunta, sem criar", noMutation(r)[1] && (!!draftOf(r) || r.trace.outcome === "pediu_informacao")],
      ["se rascunho: REQ, software, baixa", !draftOf(r) || draftIs(draftOf(r), { type: "REQ", category: "software", priority: "baixa" })],
    ],
  },
];

const filter = process.argv[2];
const { config, id: modelId } = modelFromEnv();
const agent = createNexoAgent(config);
const delayMs = Number(process.env.EVAL_DELAY_MS ?? 15_000);
console.log(`Modelo: ${modelId}`);

let passed = 0;
let total = 0;
let tokens = 0;
const selected = CASES.filter((c) => !filter || c.id.includes(filter));
for (const [i, c] of selected.entries()) {
  if (i > 0) await new Promise((r) => setTimeout(r, delayMs));
  const tickets = fakeTickets(now);
  const started = Date.now();
  const result = await runTurn({
    agent,
    modelId,
    tickets: tickets.client,
    employee: ana,
    conversationId: `eval-${c.id}`,
    state: initialAgentState(),
    userMessage: c.message,
    now,
  });
  const u = result.trace.usage;
  tokens += u.inputTokens + u.outputTokens;

  const checks = c.checks(result);
  const ok = checks.every(([, v]) => v);
  passed += ok ? 1 : 0;
  total++;
  console.log(`\n${ok ? "✓" : "✗"} ${c.id}  (${((Date.now() - started) / 1000).toFixed(1)}s, ${u.inputTokens} tokens de entrada / ${u.outputTokens} de saída)`);
  for (const [label, v] of checks) if (!v) console.log(`    ✗ ${label}`);
  console.log(`    modelo: ${result.trace.usage.model}`);
  console.log(`    ações: ${result.trace.actions.map((a) => a.tool).join(" → ") || "—"}  |  ${result.trace.intent} → ${result.trace.outcome}  |  confiança ${result.trace.confidence.score}`);
  console.log(`    resposta: ${result.reply.replace(/\s+/g, " ").slice(0, 220)}`);
}

console.log(`\n${passed}/${total} casos ok · ${tokens} tokens no total · média de ${Math.round(tokens / Math.max(total, 1))} por turno`);
process.exitCode = passed === total ? 0 : 1;
