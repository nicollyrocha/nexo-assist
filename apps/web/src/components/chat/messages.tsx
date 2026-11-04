"use client";

import type { DecisionTrace, MessageBlock, MessageView, TraceAction } from "@nexo/shared";
import { Compass, TriangleAlert } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { ActionChips } from "@/components/trace/action-chips";
import { DecisionDetails } from "@/components/trace/decision-details";
import { RichText } from "@/components/ui/rich-text";
import { SystemDivider } from "@/components/ui/system-divider";
import { draftStatus, quickReplyChoice, selectionChoice } from "@/lib/conversation-state";
import { formatTime } from "@/lib/format";
import { buildChips } from "@/lib/trace-copy";
import { DraftCard, type DraftAction } from "./draft-card";
import { QuickReplies } from "./quick-replies";
import { TicketCards } from "./ticket-card";
import { TicketSelection } from "./ticket-selection";
import { UpdateDraftCard } from "./update-draft-card";

export type BlockContext = {
  messages: MessageView[];
  traces: Record<string, DecisionTrace>;
  now: Date;
  /** Pode enviar agora (sem turno em andamento, agent não pausado, sem limite). */
  canAct: boolean;
  /** Este é o último turno do agent (só ele tem seleção/opções ativas). */
  latestAgentIndex: number;
  disabledNote: string | null;
  busyDraft: { messageId: string; action: DraftAction } | null;
  onSend: (text: string, draft?: { messageId: string; action: DraftAction }) => void;
};

const bubbleText = "text-body text-ink";

/** Texto de agente com a última pergunta destacada (como a "Question" do protótipo) quando há opções logo abaixo. */
function splitQuestion(content: string, hasOptions: boolean): { body: string; question: string | null } {
  if (!hasOptions) return { body: content, question: null };
  const paragraphs = content.trim().split(/\n{2,}/);
  const last = paragraphs[paragraphs.length - 1] ?? "";
  if (paragraphs.length > 1 && last.endsWith("?") && last.length <= 90 && !/[*>\n]/.test(last)) {
    return { body: paragraphs.slice(0, -1).join("\n\n"), question: last };
  }
  return { body: content, question: null };
}

/** Cartões de chamado (sem seleção nem rascunho) seguidos de opções: o texto vem depois dos cartões, junto das opções (Tela 3). */
function trailingBubble(blocks: MessageBlock[]): boolean {
  return (
    blocks.some((b) => b.kind === "ticket_cards") &&
    !blocks.some((b) => b.kind === "ticket_selection" || b.kind === "draft" || b.kind === "update_draft") &&
    blocks.some((b) => b.kind === "quick_replies")
  );
}

export function EmployeeBubble({
  text,
  time,
  state = "sent",
  onRetry,
}: {
  text: string;
  time?: string;
  state?: "sent" | "sending" | "failed";
  onRetry?: () => void;
}) {
  return (
    <article aria-label={time ? `Você, ${time}` : "Você"} className="flex flex-col items-end gap-1">
      <div
        title={time ? `Enviada às ${time}` : undefined}
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-bubble rounded-br-tail bg-ink px-4 py-2.75 text-body text-white sm:max-w-bubble-user ${
          state === "sending" ? "opacity-70" : ""
        } ${state === "failed" ? "outline-2 outline-offset-1 outline-danger" : ""}`}
      >
        <span className="sr-only">Você disse: </span>
        {text}
      </div>
      {state === "failed" && (
        <p role="alert" className="text-meta text-danger-ink">
          Não foi enviada.{" "}
          <button type="button" onClick={onRetry} className="rounded-tag font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Tentar de novo
          </button>
        </p>
      )}
    </article>
  );
}

function AgentBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full max-w-bubble-agent flex-col gap-3 rounded-bubble rounded-tl-tail bg-surface px-4 py-3 outline-1 -outline-offset-1 outline-border-subtle">
      {children}
    </div>
  );
}

function BubbleText({ text, time, hasOptions }: { text: string; time: string; hasOptions: boolean }) {
  const { body, question } = splitQuestion(text, hasOptions);
  return (
    <>
      <div title={`Enviada às ${time}`} className={`${bubbleText} leading-5.5`}>
        <RichText text={body} className="flex flex-col gap-3" />
      </div>
      {question && <p className="text-body/natural font-semibold text-ink">{question}</p>}
    </>
  );
}

function AgentName({ id, time, label = "Nexo Assist" }: { id: string; time?: string; label?: string }) {
  return (
    <span id={id} className="text-meta font-semibold text-ink">
      {label}
      {time && <span className="sr-only">, {time}</span>}
    </span>
  );
}

/** Turno em andamento: chips ao vivo, "trabalhando…" e o texto chegando com cursor. */
export function LiveAgentTurn({ actions, reply, slow }: { actions: TraceAction[]; reply: string; slow: boolean }) {
  const nameId = useId();
  const chips = buildChips(actions, []);
  return (
    <article aria-labelledby={nameId} aria-busy="true" className="flex flex-col items-start gap-1.5">
      <ActionChips who={<AgentName id={nameId} />} chips={chips} working={reply.length === 0} slow={slow} />
      {reply && (
        <AgentBubble>
          <div className={`${bubbleText} leading-5.5`}>
            <RichText text={reply} className="flex flex-col gap-3" />
            <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-caret bg-ink" />
          </div>
        </AgentBubble>
      )}
    </article>
  );
}

export function AgentErrorBlock({ code, onRetry }: { code: string; onRetry: () => void }) {
  const text =
    code === "unavailable"
      ? "O assistente está fora do ar por alguns instantes. Sua mensagem ficou registrada."
      : "Algo deu errado do nosso lado e não consegui responder. Sua mensagem ficou registrada.";
  return (
    <div role="alert" className="flex w-full max-w-bubble-agent gap-2.5 rounded-bubble bg-warning-tint p-3 text-ui text-warning-ink">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>
        {text}{" "}
        <button type="button" onClick={onRetry} className="rounded-tag font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          Tentar de novo
        </button>
      </p>
    </div>
  );
}

function Blocks({ message, index, ctx }: { message: MessageView; index: number; ctx: BlockContext }) {
  const isLatest = index === ctx.latestAgentIndex;
  const hasCards = message.blocks.some((b) => b.kind === "ticket_cards" || b.kind === "ticket_selection");
  const hasDraft = message.blocks.some((b) => b.kind === "draft" || b.kind === "update_draft");
  const trailing = trailingBubble(message.blocks);
  const busy = ctx.busyDraft?.messageId === message.id ? ctx.busyDraft.action : null;
  const onDraft = (action: DraftAction, text: string) => ctx.onSend(text, { messageId: message.id, action });

  const render = (block: MessageBlock, i: number): ReactNode => {
    switch (block.kind) {
      case "ticket_cards":
        return <TicketCards key={i} tickets={block.tickets} now={ctx.now} />;
      case "ticket_selection":
        return (
          <TicketSelection
            key={i}
            tickets={block.tickets}
            prompt={block.prompt}
            chosen={selectionChoice(ctx.messages, index, block.tickets.map((t) => t.id))}
            interactive={isLatest && ctx.canAct}
            now={ctx.now}
            onChoose={(text) => ctx.onSend(text)}
          />
        );
      case "draft":
        return (
          <DraftCard
            key={block.actionId}
            block={block}
            status={draftStatus(ctx.messages, ctx.traces, index)}
            enabled={ctx.canAct}
            disabledNote={ctx.disabledNote}
            busy={busy}
            now={ctx.now}
            onAction={onDraft}
          />
        );
      case "update_draft":
        return (
          <UpdateDraftCard
            key={block.actionId}
            block={block}
            status={draftStatus(ctx.messages, ctx.traces, index)}
            enabled={ctx.canAct}
            disabledNote={ctx.disabledNote}
            busy={busy}
            now={ctx.now}
            onAction={onDraft}
          />
        );
      case "quick_replies":
        // Com rascunho na mensagem, os botões do card já são as opções (evita Confirmar duplicado).
        if (hasDraft || !hasCards) return null;
        return (
          <AgentBubble key={i}>
            {trailing && message.content.trim() && <BubbleText text={message.content} time={formatTime(message.createdAt)} hasOptions />}
            <QuickReplies
              label="Opções de resposta"
              options={block.options}
              chosen={quickReplyChoice(ctx.messages, index, block.options)}
              enabled={isLatest && ctx.canAct}
              onChoose={(text) => ctx.onSend(text)}
            />
          </AgentBubble>
        );
      case "event":
        return <SystemDivider key={i} text={block.text} time={formatTime(message.createdAt)} className="w-full self-stretch pt-2 pb-1" />;
    }
  };

  return <>{message.blocks.map(render)}</>;
}

export function AgentMessage({ message, index, ctx }: { message: MessageView; index: number; ctx: BlockContext }) {
  const nameId = useId();
  const detailsId = useId();
  const buttonId = useId();
  const [open, setOpen] = useState(false);
  const trace = message.traceId ? ctx.traces[message.traceId] ?? null : null;
  const time = formatTime(message.createdAt);
  const chips = trace ? buildChips(trace.actions, message.blocks, trace.outcome) : [];
  const hasCards = message.blocks.some((b) => b.kind === "ticket_cards" || b.kind === "ticket_selection");
  const hasDraft = message.blocks.some((b) => b.kind === "draft" || b.kind === "update_draft");
  const inlineReplies = !hasCards && !hasDraft ? message.blocks.find((b) => b.kind === "quick_replies") : undefined;
  const isLatest = index === ctx.latestAgentIndex;

  return (
    <article aria-labelledby={nameId} className="flex flex-col items-start gap-1.5">
      <ActionChips
        who={<AgentName id={nameId} time={time} />}
        chips={chips}
        details={trace ? { id: detailsId, buttonId, open, onToggle: () => setOpen((v) => !v) } : undefined}
      />
      {trace && open && <DecisionDetails trace={trace} blocks={message.blocks} audience="employee" id={detailsId} labelledBy={buttonId} />}
      {(message.content.trim() || inlineReplies) && !trailingBubble(message.blocks) && (
        <AgentBubble>
          {message.content.trim() && <BubbleText text={message.content} time={time} hasOptions={!!inlineReplies} />}
          {inlineReplies && (
            <QuickReplies
              label="Opções de resposta"
              options={inlineReplies.options}
              chosen={quickReplyChoice(ctx.messages, index, inlineReplies.options)}
              enabled={isLatest && ctx.canAct}
              onChoose={(text) => ctx.onSend(text)}
            />
          )}
        </AgentBubble>
      )}
      <Blocks message={message} index={index} ctx={ctx} />
      {trace?.outcome === "redirecionou" && (
        <p className="flex items-center gap-1.5 text-meta text-muted">
          <Compass aria-hidden="true" className="size-3" />
          Sem chamado aberto: esse assunto é de outra área.
        </p>
      )}
    </article>
  );
}

export function AnalystMessage({ message, tier }: { message: MessageView; tier: string | null }) {
  const nameId = useId();
  const time = formatTime(message.createdAt);
  return (
    <article aria-labelledby={nameId} className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-1.5">
        <span id={nameId} className="text-meta font-semibold text-ink">
          {message.authorName}
          <span className="sr-only">, {time}</span>
        </span>
        <span className="rounded-tag bg-success-tint px-1.5 py-px text-tiny font-semibold text-success-ink">
          {tier ? `Suporte ${tier}` : "Analista"}
        </span>
      </div>
      <div
        title={`Enviada às ${time}`}
        className="w-full max-w-bubble-agent whitespace-pre-wrap break-words rounded-bubble rounded-tl-tail bg-bubble-analyst px-4 py-3 text-body leading-5.5 text-ink"
      >
        {message.content}
      </div>
    </article>
  );
}
