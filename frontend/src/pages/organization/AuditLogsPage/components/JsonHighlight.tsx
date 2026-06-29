/* eslint-disable react/no-danger */
import { twMerge } from "tailwind-merge";

// Lightweight, dependency-free JSON syntax highlighter for read-only display.
// The input is escaped before any markup is injected, so values that happen to
// contain HTML (e.g. an actor name or secret path) are rendered as plain text.
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;"
};

const TOKEN_REGEX =
  /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;

const highlightJson = (json: string) =>
  json
    .replace(/[&<>]/g, (char) => HTML_ESCAPES[char])
    .replace(TOKEN_REGEX, (match) => {
      let className = "text-info/85"; // number
      if (/^"/.test(match)) {
        className = /:$/.test(match) ? "text-foreground/85" : "text-success/85"; // key vs string
      } else if (/true|false/.test(match)) {
        className = "text-warning/85"; // boolean
      } else if (/null/.test(match)) {
        className = "text-muted/85"; // null
      }
      return `<span class="${className}">${match}</span>`;
    });

type Props = {
  value: unknown;
  className?: string;
};

export const JsonHighlight = ({ value, className }: Props) => (
  <pre
    className={twMerge(
      "thin-scrollbar overflow-auto rounded-md border border-border bg-card p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-mineshaft-400",
      className
    )}
  >
    <code dangerouslySetInnerHTML={{ __html: highlightJson(JSON.stringify(value, null, 2)) }} />
  </pre>
);
