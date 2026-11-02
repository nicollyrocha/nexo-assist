import type { Confidence } from "@nexo/shared";
import { CircleHelp, TriangleAlert } from "lucide-react";
import { percent } from "@/lib/format";
import { CONFIDENCE_LABELS } from "@/lib/trace-copy";

const FILLED: Record<Confidence["level"], number> = { alta: 3, media: 2, baixa: 1 };
const SEGMENT: Record<Confidence["level"], string> = {
  alta: "bg-confianca-alta",
  media: "bg-confianca-media",
  baixa: "bg-confianca-baixa",
};
export const CONFIDENCE_INK: Record<Confidence["level"], string> = {
  alta: "text-confianca-alta-ink",
  media: "text-confianca-media-ink",
  baixa: "text-confianca-baixa-ink",
};

/** Medidor de 3 segmentos (20×6, 3px de espaço). Decorativo: o rótulo escrito diz tudo. */
export function ConfidenceMeter({ level }: { level: Confidence["level"] }) {
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-0.75">
      {[0, 1, 2].map((i) => (
        <span key={i} className={`h-1.5 w-5 rounded-full ${i < FILLED[level] ? SEGMENT[level] : "bg-meter-track"}`} />
      ))}
    </span>
  );
}

/** Badge do console para confiança média/baixa ("Confiança baixa · 41%"). Alta não tem badge. */
export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  if (confidence.level === "alta") return null;
  const low = confidence.level === "baixa";
  const Icon = low ? TriangleAlert : CircleHelp;
  const pct = percent(confidence.score);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-tag px-1.5 py-px text-tiny font-semibold ${
        low ? "bg-confianca-baixa-tint text-confianca-baixa-ink" : "bg-confianca-media-tint text-confianca-media-ink"
      }`}
    >
      <Icon aria-hidden="true" className="size-3" />
      <span aria-hidden="true" className="tabular-nums">
        Confiança {CONFIDENCE_LABELS[confidence.level].toLowerCase()} · {pct}%
      </span>
      <span className="sr-only">
        Confiança {CONFIDENCE_LABELS[confidence.level].toLowerCase()}, {pct} por cento
      </span>
    </span>
  );
}
