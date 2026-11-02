import type { DecisionTrace, MessageBlock } from "@nexo/shared";
import { LOW_CONFIDENCE_THRESHOLD } from "@nexo/shared";
import { ArrowRight, BookOpen, Check, Minus, RotateCw, TriangleAlert } from "lucide-react";
import { formatInt, formatSeconds, percent } from "@/lib/format";
import {
  CONFIDENCE_COPY,
  CONFIDENCE_LABELS,
  INTENT_LABELS,
  RULE_LABELS,
  RULE_SOURCE,
  SECTION_TITLES,
  chipText,
  humanResult,
  outcomeText,
  turnTicketId,
  type Audience,
} from "@/lib/trace-copy";
import { CONFIDENCE_INK, ConfidenceMeter } from "./confidence";

type Props = {
  trace: DecisionTrace;
  blocks: MessageBlock[];
  audience: Audience;
  id: string;
  labelledBy: string;
};

function SectionTitle({ children }: { children: string }) {
  return <h4 className="text-meta font-semibold text-muted">{children}</h4>;
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const STATE_ICON = { ok: Check, sem_resultado: Minus, erro: TriangleAlert } as const;

/**
 * Camada 2 da transparência: o que entendeu, o que fez, segurança, por quê e o que descartou.
 * Variante `employee` (chat, enxuta, 1ª pessoa) e `analyst` (console, completa, 3ª pessoa).
 */
export function DecisionDetails({ trace, blocks, audience, id, labelledBy }: Props) {
  const analyst = audience === "analyst";
  const titles = SECTION_TITLES[audience];
  const level = trace.confidence.level;
  const lowHighlight = analyst && level === "baixa";
  const ticketId = turnTicketId(trace, blocks);

  return (
    <div
      id={id}
      role="region"
      aria-labelledby={labelledBy}
      className={`flex w-full flex-col gap-3.5 rounded-bubble bg-surface-subtle p-3.5 outline-1 -outline-offset-1 outline-border-subtle sm:p-4 ${
        analyst ? "max-w-bubble-console sm:max-w-[560px]" : "max-w-bubble-agent"
      } ${lowHighlight ? "border-l-3 border-confianca-baixa" : ""}`}
    >
      <section className="flex flex-col gap-1">
        <SectionTitle>{titles.understood}</SectionTitle>
        <p className="text-ui text-ink">
          {analyst && (
            <span className="mr-2 inline-flex rounded-full bg-surface px-2 py-0.5 align-middle text-micro font-medium text-ink-secondary outline-1 -outline-offset-1 outline-border-subtle">
              {INTENT_LABELS[trace.intent]}
            </span>
          )}
          {trace.understanding}
        </p>
      </section>

      <section className="flex flex-col gap-1.5">
        <SectionTitle>{titles.did}</SectionTitle>
        {trace.actions.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {trace.actions.map((action, i) => {
              const Icon = STATE_ICON[action.outcome];
              const error = action.outcome === "erro";
              const result = analyst ? action.resultSummary : humanResult(action);
              return (
                <li key={i} className="flex gap-2 text-ui">
                  <Icon aria-hidden="true" className={`mt-0.75 size-3.5 shrink-0 ${error ? "text-danger-ink" : "text-muted"}`} />
                  <div className="min-w-0">
                    <span className={error ? "text-danger-ink" : "text-ink"}>{chipText(action, trace.outcome, blocks)}</span>
                    {result && <span className="text-ink-secondary"> — {result}</span>}
                    {analyst && (
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-micro text-muted tabular-nums">
                        <span>Entrada: {action.inputSummary || "—"}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatSeconds(action.durationMs)}</span>
                        <span aria-hidden="true">·</span>
                        <span className={`inline-flex items-center gap-1 ${error ? "text-danger-ink" : action.attempts > 1 ? "text-warning-ink" : ""}`}>
                          {action.attempts > 1 && <RotateCw aria-hidden="true" className="size-3" />}
                          {action.attempts === 1 ? "1 tentativa" : `${action.attempts} tentativas`}
                        </span>
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="flex gap-2 text-ui font-medium text-ink">
          <ArrowRight aria-hidden="true" className="mt-0.75 size-3.5 shrink-0 text-muted" />
          <span>
            <span className="sr-only">Resultado: </span>
            {outcomeText(trace.outcome, audience, ticketId)}
          </span>
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <SectionTitle>{titles.confidence}</SectionTitle>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ui">
          <ConfidenceMeter level={level} />
          <span className={`font-semibold ${CONFIDENCE_INK[level]}`}>
            {analyst ? (
              <>
                <span className="tabular-nums">
                  {CONFIDENCE_LABELS[level]} · {percent(trace.confidence.score)}%
                </span>
                {level === "baixa" && " — transferência automática"}
              </>
            ) : (
              CONFIDENCE_LABELS[level]
            )}
          </span>
        </div>
        <p className="text-ui text-ink-secondary">
          {!analyst && `${capitalize(CONFIDENCE_COPY[level].employee.split(" — ")[1] ?? "")} `}
          {trace.confidence.reason}
        </p>
        {analyst && level === "baixa" && (
          <p className="text-micro text-muted">
            Abaixo de {percent(LOW_CONFIDENCE_THRESHOLD)}% o caso vai automaticamente para um analista (Anexo A, transferência).
          </p>
        )}
      </section>

      <section className="flex flex-col gap-1.5">
        <SectionTitle>{titles.why}</SectionTitle>
        <p className="text-ui text-ink">{trace.rationale}</p>
        {trace.rulesApplied.length > 0 && (
          <ul className="flex flex-col gap-2">
            {trace.rulesApplied.map((r, i) => (
              <li key={i} className="flex flex-col items-start gap-1">
                <span className="inline-flex items-center gap-1 rounded-tag bg-surface px-1.5 py-0.5 text-micro font-medium text-ink-secondary outline-1 -outline-offset-1 outline-border-subtle">
                  <BookOpen aria-hidden="true" className="size-3" />
                  {RULE_LABELS[r.rule]}
                </span>
                <span className="text-ui text-ink-secondary">{r.explanation}</span>
                {analyst && <span className="text-micro text-muted">{RULE_SOURCE[r.rule]}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {(analyst || trace.alternativesDiscarded.length > 0) && (
        <section className="flex flex-col gap-1">
          <SectionTitle>{titles.discarded}</SectionTitle>
          {trace.alternativesDiscarded.length > 0 ? (
            <ul className="list-disc pl-4 text-ui text-ink-secondary">
              {trace.alternativesDiscarded.map((alt, i) => (
                <li key={i}>{alt}</li>
              ))}
            </ul>
          ) : (
            <p className="text-ui text-muted">Nada descartado neste turno.</p>
          )}
        </section>
      )}

      {analyst && (
        <section className="flex flex-col gap-1 border-t border-border-subtle pt-2.5">
          <h4 className="sr-only">{titles.tech}</h4>
          <p className="text-micro text-muted tabular-nums">
            {trace.usage.model} · {formatInt(trace.usage.inputTokens)} tokens de entrada ({formatInt(trace.usage.cacheReadTokens)} do cache) ·{" "}
            {formatInt(trace.usage.outputTokens)} de saída · {formatSeconds(trace.usage.latencyMs)}
          </p>
        </section>
      )}
    </div>
  );
}
