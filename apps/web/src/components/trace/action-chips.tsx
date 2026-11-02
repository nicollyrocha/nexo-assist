"use client";

import { Check, ChevronDown, LoaderCircle, Minus, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { Chip } from "@/lib/trace-copy";

type Props = {
  /** "Nexo Assist" no chat; no console o remetente fica numa linha própria. */
  who?: ReactNode;
  chips: Chip[];
  /** Turno em andamento: mostra "trabalhando…" no fim. */
  working?: boolean;
  slow?: boolean;
  /** Painel "Por quê?" (só quando há trace). */
  details?: { id: string; open: boolean; onToggle: () => void; buttonId: string };
  align?: "start" | "end";
  /** Máximo de chips visíveis a partir de sm (no celular são 3). */
  maxVisible?: number;
};

const ICON: Record<Exclude<Chip["state"], "pending">, typeof Check> = {
  ok: Check,
  sem_resultado: Minus,
  erro: TriangleAlert,
};

function ChipItem({ chip }: { chip: Chip }) {
  const error = chip.state === "erro";
  const Icon = chip.state === "pending" ? LoaderCircle : ICON[chip.state];
  return (
    <>
      <Icon
        aria-hidden="true"
        className={`size-3 shrink-0 ${error ? "text-danger-ink" : "text-muted"} ${chip.state === "pending" ? "animate-spin" : ""}`}
      />
      <span className={error ? "text-danger-ink" : "text-muted"}>
        {chip.text}
        {chip.attempts > 1 ? ` · ${chip.attempts} tentativas` : ""}
      </span>
    </>
  );
}

/** Camada 1 da transparência: o que o agent fez, sempre visível acima da resposta. */
export function ActionChips({ who, chips, working, slow, details, align = "start", maxVisible = 5 }: Props) {
  const mobileMax = 3;
  const hiddenDesktop = Math.max(0, chips.length - maxVisible);
  const hiddenMobile = Math.max(0, chips.length - mobileMax);
  const openDetails = () => {
    if (details && !details.open) details.onToggle();
  };

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${align === "end" ? "justify-end" : ""}`}>
      {who}
      {(chips.length > 0 || working) && (
        <ul aria-label="O que o assistente fez" className={`contents`}>
          {chips.map((chip, i) => (
            <li
              key={chip.key}
              className={`animate-chip-in items-center gap-1.25 whitespace-nowrap text-meta ${
                i >= mobileMax ? "hidden sm:inline-flex" : "inline-flex"
              } ${i >= maxVisible ? "sm:hidden" : ""}`}
            >
              <ChipItem chip={chip} />
            </li>
          ))}
          {working && (
            <li className="inline-flex animate-chip-in items-center gap-1.25 whitespace-nowrap text-meta">
              <ChipItem
                chip={{ key: "working", state: "pending", attempts: 1, text: slow ? "ainda trabalhando… o sistema de chamados está lento" : "trabalhando…" }}
              />
            </li>
          )}
        </ul>
      )}
      {details && hiddenMobile > 0 && (
        <button
          type="button"
          onClick={openDetails}
          aria-label={`Mostrar mais ${hiddenMobile} ações`}
          className="-my-1 rounded-tag py-1 text-meta text-muted hover:text-ink sm:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          +{hiddenMobile}
        </button>
      )}
      {details && hiddenDesktop > 0 && (
        <button
          type="button"
          onClick={openDetails}
          aria-label={`Mostrar mais ${hiddenDesktop} ações`}
          className="-my-1 hidden rounded-tag py-1 text-meta text-muted hover:text-ink sm:inline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          +{hiddenDesktop}
        </button>
      )}
      {details && (
        <button
          type="button"
          id={details.buttonId}
          aria-expanded={details.open}
          aria-controls={details.id}
          aria-label="Por que o assistente respondeu assim"
          onClick={details.onToggle}
          className="-my-1 inline-flex items-center gap-1 rounded-tag py-1 text-meta font-medium text-primary-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Por quê?
          <ChevronDown aria-hidden="true" className={`size-3 transition-transform duration-200 ${details.open ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
}
