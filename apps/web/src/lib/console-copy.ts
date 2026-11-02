import { LOW_CONFIDENCE_THRESHOLD, confidenceLevel, type ConversationStatus, type ConversationSummary } from "@nexo/shared";
import { firstName, formatAgo, minutesSince, percent } from "./format";
import { TRANSFER_REASON_SHORT } from "./trace-copy";

// Textos do console (docs/design/console.md §3 e §4).

export type SummaryTag = { dot: string; tone: string; parts: string[]; wait: string | null; longWait: boolean };

/** Tag de estado do item da lista ("Transferida · pediu um analista · espera há 7 min"). */
export function summaryTag(c: ConversationSummary, myId: string, now: Date): SummaryTag {
  const wait = c.waitingSince ? `espera ${formatAgo(c.waitingSince, now)}` : null;
  const longWait = !!c.waitingSince && minutesSince(c.waitingSince, now) > 30;
  switch (c.status) {
    case "aguardando_atendente": {
      if (c.transferReason === "baixa_confianca") {
        const conf = c.minConfidence !== null ? `confiança baixa, ${percent(c.minConfidence)}%` : "confiança baixa";
        return { dot: "bg-warning", tone: "text-warning-ink", parts: ["Agent pediu ajuda", conf], wait, longWait };
      }
      const reason = c.transferReason ? TRANSFER_REASON_SHORT[c.transferReason] : null;
      return {
        dot: "bg-danger",
        tone: "text-danger-ink",
        parts: ["Transferida", ...(reason ? [reason] : []), ...(c.ticketId ? [c.ticketId] : [])],
        wait,
        longWait,
      };
    }
    case "em_atendimento":
      return c.assignedAnalystId === myId
        ? { dot: "bg-primary", tone: "text-primary-ink", parts: ["Você está atendendo"], wait: null, longWait: false }
        : { dot: "bg-accent", tone: "text-muted", parts: [`Com ${c.assignedAnalystName ?? "outro analista"}`], wait: null, longWait: false };
    case "ativa": {
      const medium = c.minConfidence !== null && confidenceLevel(c.minConfidence) === "media";
      return { dot: "bg-success", tone: "text-muted", parts: ["Agent atendendo", ...(medium ? ["confiança média"] : [])], wait: null, longWait: false };
    }
    case "encerrada":
      return {
        dot: "bg-status-encerrado",
        tone: "text-muted",
        parts: [c.assignedAnalystName ? `Encerrada por ${c.assignedAnalystName}` : "Resolvida pelo agent"],
        wait: null,
        longWait: false,
      };
  }
}

export function previewPrefix(c: ConversationSummary, myId: string): string {
  switch (c.lastMessageRole) {
    case "agent":
      return "Nexo: ";
    case "analista":
      return c.assignedAnalystId === myId ? "Você: " : c.assignedAnalystName ? `${firstName(c.assignedAnalystName)}: ` : "Analista: ";
    default:
      return "";
  }
}

export const STATUS_WORD: Record<ConversationStatus, string> = {
  ativa: "com o agent",
  aguardando_atendente: "aguardando atendente",
  em_atendimento: "em atendimento",
  encerrada: "encerrada",
};

export const FILTER_LABELS = {
  todas: "Todas",
  para_voce: "Para você",
  com_agent: "Com o agent",
  minhas: "Minhas",
} as const;

export const EMPTY_LIST_COPY = {
  todas: { title: "Ainda não há conversas.", body: null },
  para_voce: { title: "Ninguém esperando por você agora.", body: "Quando o agent transferir uma conversa, ela aparece aqui." },
  com_agent: { title: "Nenhuma conversa com o agent neste momento.", body: null },
  minhas: { title: "Você não está atendendo nenhuma conversa.", body: null },
} as const;

export const isLowConfidence = (score: number | null) => score !== null && score < LOW_CONFIDENCE_THRESHOLD;
