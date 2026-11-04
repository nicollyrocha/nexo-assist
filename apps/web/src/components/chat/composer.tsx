"use client";

import { ArrowUp } from "lucide-react";
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { formatInt } from "@/lib/format";

const MAX_CHARS = 2000;
const MAX_LINES = 6;
const LINE = 21;
const PADDING_Y = 26; // py-3.25 × 2

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Turno em andamento: Enviar desabilitado, texto continua editável. */
  sending: boolean;
  disabled?: boolean;
  placeholder: string;
  label: string;
  describedBy?: string;
  /** Ctrl/⌘+Enter com o composer vazio confirma o rascunho pendente. */
  onConfirmShortcut?: () => void;
  /** Contador da sessão, à direita da linha de baixo. */
  meta?: React.ReactNode;
};

export type ComposerHandle = { focus: () => void };

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { value, onChange, onSubmit, sending, disabled, placeholder, label, describedBy, onConfirmShortcut, meta },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => textareaRef.current?.focus() }), []);

  // Cresce de 1 até 6 linhas; depois rola.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, LINE * MAX_LINES + PADDING_Y)}px`;
  }, [value]);

  const canSend = !sending && !disabled && value.trim().length > 0 && value.length <= MAX_CHARS;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    if ((e.ctrlKey || e.metaKey) && value.trim() === "" && onConfirmShortcut) {
      e.preventDefault();
      onConfirmShortcut();
      return;
    }
    if (e.shiftKey) return;
    e.preventDefault();
    if (canSend) onSubmit();
  };

  const chars = value.length;

  return (
    <div className="flex flex-col gap-1.5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) onSubmit();
        }}
        className={`flex min-h-12 items-end gap-2 rounded-bubble bg-surface pr-1.5 pl-4 outline-1 -outline-offset-1 outline-border-control focus-within:outline-[1.5px] focus-within:outline-primary ${
          disabled ? "opacity-55" : ""
        }`}
      >
        <label className="sr-only" htmlFor="composer-input">
          {label}
        </label>
        <textarea
          id="composer-input"
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={MAX_CHARS + 200}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 resize-none bg-transparent py-3.25 text-body text-ink placeholder:text-muted focus:outline-none disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={sending || disabled}
          aria-disabled={!canSend}
          aria-label="Enviar"
          className="mb-1.5 inline-flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-tag bg-primary text-ui font-semibold text-white enabled:hover:bg-primary-hover enabled:active:bg-primary-active enabled:cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto sm:px-3"
        >
          <ArrowUp aria-hidden="true" className="size-3.5" />
          <span aria-hidden="true" className="hidden sm:inline">
            Enviar
          </span>
        </button>
      </form>
      {(chars >= 1800 || meta) && (
        <div className="flex items-center justify-center gap-3 sm:justify-between">
          {chars >= 1800 ? (
            <p className={`text-meta tabular-nums ${chars >= 1950 ? "text-warning-ink" : "text-muted"}`}>
              {formatInt(chars)}/{formatInt(MAX_CHARS)}
            </p>
          ) : (
            <span className="hidden sm:block" />
          )}
          {meta}
        </div>
      )}
    </div>
  );
});
