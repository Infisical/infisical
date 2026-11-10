import * as React from "react";

import { useDescendantFlags } from "../lib/descendant-flags";
import { useFieldControlAttributes } from "../lib/field-context";
import { cn } from "../lib/utils";
import { CopyButton } from "./sensitive-editor";

import styles from "./code.module.css";

const snippetFlags = { "data-input-focus": `:scope > .${styles.input}:focus-visible` };

type SnippetLinesStyle = React.CSSProperties & {
  "--v4-snippet-lines": number;
  "--v4-snippet-rows": number;
};
const snippetWatch = { subtree: false, focus: true };

export function Snippet({
  id,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  value,
  prompt,
  size = "sm",
  copyable = true,
  copyLabel = "Copy command",
  label,
  onCopy,
  writeClipboard,
  maxLines,
  className,
  ref
}: {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  value: string;
  prompt?: string;
  size?: "sm" | "md";
  copyable?: boolean;
  copyLabel?: string;
  label: string;
  onCopy?: (value: string) => void;
  writeClipboard?: (value: string) => Promise<void>;
  /** Shows the value on several lines: it keeps its line breaks, wraps long lines and grows up to this many lines, then scrolls. Copy still copies the whole value. */
  maxLines?: number;
  className?: string;
} & { ref?: React.Ref<HTMLInputElement | HTMLTextAreaElement> }) {
  const attributes = useFieldControlAttributes({
    id,
    "aria-describedby": describedBy,
    "aria-invalid": invalid
  });
  const snippetRef = useDescendantFlags<HTMLDivElement>(snippetFlags, snippetWatch);
  const multiline = maxLines !== undefined;
  const lines = Math.max(1, maxLines ?? 1);
  const rows = Math.min(lines, value.split("\n").length);
  const field = multiline ? (
    <textarea
      ref={ref as React.Ref<HTMLTextAreaElement>}
      {...attributes}
      className={cn(styles.input, styles.snippetLines)}
      data-scroll-fade="y"
      style={{ "--v4-snippet-lines": lines, "--v4-snippet-rows": rows } as SnippetLinesStyle}
      aria-label={label}
      value={value}
      rows={rows}
      readOnly
      spellCheck={false}
    />
  ) : (
    <input
      ref={ref as React.Ref<HTMLInputElement>}
      {...attributes}
      className={styles.input}
      aria-label={label}
      value={value}
      readOnly
      spellCheck={false}
    />
  );
  return (
    <div
      ref={snippetRef}
      data-slot="snippet"
      data-size={size}
      data-multiline={multiline || undefined}
      className={cn(styles.snippet, size === "sm" && styles.snippetSmall, className)}
    >
      {prompt && (
        <span aria-hidden="true" className={styles.prompt}>
          {prompt}
        </span>
      )}
      {field}
      {copyable && (
        <CopyButton
          value={value}
          size={size}
          label={copyLabel}
          iconOnly
          onCopy={onCopy}
          writeClipboard={writeClipboard}
        />
      )}
    </div>
  );
}
Snippet.displayName = "Snippet";
