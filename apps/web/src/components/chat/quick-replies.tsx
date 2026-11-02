"use client";

type Props = {
  options: string[];
  chosen: string | null;
  enabled: boolean;
  label: string;
  onChoose: (text: string) => void;
};

/** Opções rápidas (bloco `quick_replies`): clique envia o texto como mensagem do funcionário. */
export function QuickReplies({ options, chosen, enabled, label, onChoose }: Props) {
  const disabled = !enabled || chosen !== null;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const selected = chosen === option;
        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => onChoose(option)}
            className={`min-h-9 rounded-control px-3 py-1.75 text-ui font-medium outline-1 -outline-offset-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-0 ${
              selected
                ? "bg-primary-tint text-primary-ink outline-accent"
                : "bg-surface text-ink outline-border-subtle enabled:hover:bg-surface-subtle"
            } disabled:cursor-default ${disabled && !selected ? "opacity-55" : ""}`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
