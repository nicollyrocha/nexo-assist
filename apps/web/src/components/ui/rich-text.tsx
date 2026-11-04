import { Fragment, type ReactNode } from "react";

// Markdown limitado das respostas (chat.md §2): parágrafos, **negrito**, listas e links.
// Montado como nós React (sem innerHTML), então texto do modelo nunca vira HTML.

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s](?:[^*]*[^*\s])?\*|\[[^\]]+\]\((?:https?:\/\/|mailto:)[^)\s]+\))/g;

function inline(text: string, keyBase: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={key} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      return (
        <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer" className="cursor-pointer font-medium text-primary-ink underline underline-offset-2">
          {link[1]}
        </a>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className={className}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*>/.test(l))) {
          const quote = lines.map((l) => l.replace(/^\s*>\s?/, "")).join("\n");
          return (
            <blockquote key={bi} className="whitespace-pre-wrap break-words border-l-2 border-border-subtle pl-3 text-ink-secondary">
              {inline(quote, String(bi))}
            </blockquote>
          );
        }
        const isList = lines.every((l) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(l));
        if (isList) {
          const ordered = /^\s*\d/.test(lines[0]);
          const items = lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ""), `${bi}-${li}`)}</li>);
          return ordered ? (
            <ol key={bi} className="list-decimal pl-5">{items}</ol>
          ) : (
            <ul key={bi} className="list-disc pl-5">{items}</ul>
          );
        }
        return (
          <p key={bi} className="whitespace-pre-wrap break-words">
            {inline(block, String(bi))}
          </p>
        );
      })}
    </div>
  );
}
