import {
  AFFECTED_LABELS,
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  TICKET_TYPE_LABELS,
  type DecisionTrace,
  type MessageView,
  type TicketDraft,
} from "@nexo/shared";
import { ticketIdsIn, turnTicketId } from "./trace-copy";

// Estado dos blocos interativos derivado da própria conversa (chat.md §3.3 e pendência 1):
// o backend só cria/atualiza em mensagem posterior, então a UI lê o que veio depois do bloco.

/** Frases fixas que os botões do rascunho enviam como mensagem do funcionário. */
export const DRAFT_PHRASES = {
  confirm: "Confirmo, pode criar o chamado.",
  cancel: "Pode cancelar, não quero abrir esse chamado.",
  confirmUpdate: (id: string) => `Confirmo, pode atualizar o ${id}.`,
  confirmReopen: (id: string) => `Confirmo, pode reabrir o ${id}.`,
  cancelUpdate: (id: string) => `Pode cancelar, não quero mudar o ${id}.`,
};

export type DraftStatus =
  | { kind: "pending" }
  | { kind: "created"; ticketId: string | null; verb: "criado" | "atualizado" | "reaberto" }
  | { kind: "failed"; attempts: number }
  | { kind: "superseded" }
  | { kind: "cancelled" };

const isCancel = (text: string) => /^pode cancelar\b/i.test(text.trim());

/**
 * Estado do rascunho (ou proposta de atualização) da mensagem `index`, olhando o que veio depois:
 * confirmação registrada no trace, cancelamento pelo funcionário, rascunho mais novo ou falha ao criar.
 */
export function draftStatus(messages: MessageView[], traces: Record<string, DecisionTrace>, index: number): DraftStatus {
  let failed: number | null = null;
  for (let i = index + 1; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "funcionario" && isCancel(m.content) && failed === null) {
      // Só conta como cancelado se é a resposta imediata ao rascunho (não houve outro turno no meio).
      const between = messages.slice(index + 1, i).some((x) => x.role === "agent");
      if (!between) return { kind: "cancelled" };
    }
    if (m.role !== "agent") continue;
    const trace = m.traceId ? traces[m.traceId] : undefined;
    const confirm = trace?.actions.find((a) => a.tool === "confirm_pending_action");
    if (confirm?.outcome === "ok" && trace) {
      const verb =
        trace.outcome === "atualizou_chamado" ? "atualizado" : trace.outcome === "reabriu_chamado" ? "reaberto" : "criado";
      return { kind: "created", ticketId: turnTicketId(trace, m.blocks), verb };
    }
    if (confirm?.outcome === "erro") failed = confirm.attempts;
    if (m.blocks.some((b) => b.kind === "draft" || b.kind === "update_draft")) return { kind: "superseded" };
  }
  return failed !== null ? { kind: "failed", attempts: failed } : { kind: "pending" };
}

/** Escolha feita numa seleção de chamado: a mensagem seguinte do funcionário que começa com o id. */
export function selectionChoice(messages: MessageView[], index: number, ids: string[]): string | null {
  const next = messages.slice(index + 1).find((m) => m.role === "funcionario");
  if (!next) return null;
  const first = ticketIdsIn(next.content)[0];
  return first && ids.includes(first) && next.content.trim().startsWith(first) ? first : null;
}

/** Opção rápida escolhida: a mensagem seguinte do funcionário com o mesmo texto. */
export function quickReplyChoice(messages: MessageView[], index: number, options: string[]): string | null {
  const next = messages.slice(index + 1).find((m) => m.role === "funcionario");
  if (!next) return null;
  return options.find((o) => o.trim().toLowerCase() === next.content.trim().toLowerCase()) ?? null;
}

export type DraftEdits = Pick<TicketDraft, "title" | "description" | "type" | "category" | "priority" | "affected">;

/** "Quero ajustar o rascunho: prioridade: Média; categoria: Software." — só o que mudou. */
export function adjustDraftMessage(original: DraftEdits, edited: DraftEdits): string | null {
  const changes: string[] = [];
  if (edited.title.trim() !== original.title.trim()) changes.push(`título: ${edited.title.trim()}`);
  if (edited.description.trim() !== original.description.trim()) changes.push(`descrição: ${edited.description.trim()}`);
  if (edited.type !== original.type) changes.push(`tipo: ${TICKET_TYPE_LABELS[edited.type]}`);
  if (edited.category !== original.category) changes.push(`categoria: ${CATEGORY_LABELS[edited.category]}`);
  if (edited.priority !== original.priority) changes.push(`prioridade: ${PRIORITY_LABELS[edited.priority]}`);
  if (edited.affected !== original.affected) changes.push(`afetados: ${AFFECTED_LABELS[edited.affected]}`);
  if (changes.length === 0) return null;
  return `Quero ajustar o rascunho: ${changes.join("; ")}.`;
}

export function adjustUpdateMessage(
  ticketId: string,
  original: { comment: string; priority: string | null },
  edited: { comment: string; priority: string | null; priorityLabel: string | null },
): string | null {
  const changes: string[] = [];
  if (edited.comment.trim() !== original.comment.trim()) changes.push(`texto: ${edited.comment.trim()}`);
  if (edited.priority !== original.priority && edited.priorityLabel) changes.push(`prioridade: ${edited.priorityLabel}`);
  if (changes.length === 0) return null;
  return `Quero ajustar a atualização do ${ticketId}: ${changes.join("; ")}.`;
}

/** Ícone da divisória de sistema pelo texto do evento (pendência 3: falta um `eventKind`). */
export type EventIcon = "transfer" | "claimed" | "returned" | "closed" | "history" | "info";
export function eventIcon(text: string): EventIcon {
  const t = text.toLowerCase();
  if (t.includes("transferid")) return "transfer";
  if (t.includes("assumiu") || t.includes("entrou")) return "claimed";
  if (t.includes("devolv")) return "returned";
  if (t.includes("encerr")) return "closed";
  if (t.includes("retom") || t.includes("anterior")) return "history";
  return "info";
}
