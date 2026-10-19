import * as React from "react";
import { cn } from "cn";

import { useFieldControlAttributes } from "../lib/field-context";
import { CopyButton } from "./sensitive-editor";

import styles from "./code.module.css";

export const Snippet = React.forwardRef<
  HTMLInputElement,
  {
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
    className?: string;
  }
>(
  (
    {
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
      className
    },
    ref
  ) => {
    const attributes = useFieldControlAttributes({
      id,
      "aria-describedby": describedBy,
      "aria-invalid": invalid
    });
    return (
      <div
        data-slot="snippet"
        data-size={size}
        className={cn(styles.snippet, size === "sm" && styles.snippetSmall, className)}
      >
        {prompt && (
          <span aria-hidden="true" className={styles.prompt}>
            {prompt}
          </span>
        )}
        <input
          ref={ref}
          {...attributes}
          className={styles.input}
          aria-label={label}
          value={value}
          readOnly
          spellCheck={false}
        />
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
);
Snippet.displayName = "Snippet";
