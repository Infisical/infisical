/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- Named scroll regions need keyboard focus for scrolling. */
import * as React from "react";

import { cn } from "../lib/utils";
import { normalizeCodeLanguage, tokenizeCode } from "./code-tokenizer";

import styles from "./code.module.css";

export type CodeProps = Omit<React.ComponentPropsWithoutRef<"code">, "children"> & {
  children?: string;
  code?: string;
  block?: boolean;
  language?: string;
  format?: "syntax" | "plain";
  lineNumbers?: boolean;
  highlight?: readonly number[];
  wrap?: boolean;
  maxLines?: number;
  maxHeight?: React.CSSProperties["maxHeight"];
  label?: string;
};
export const Code = React.forwardRef<HTMLElement, CodeProps>(
  (
    {
      children,
      code,
      block = false,
      language = "text",
      format = "syntax",
      lineNumbers = false,
      highlight = [],
      wrap = false,
      maxLines,
      maxHeight,
      label,
      className,
      style,
      ...props
    },
    ref
  ) => {
    const value = code ?? children ?? "";
    if (!block)
      return (
        <code
          ref={ref}
          data-slot="code"
          className={cn(styles.code, styles.inline, className)}
          style={style}
          {...props}
        >
          {value}
        </code>
      );
    return (
      <pre
        data-slot="code-block-content"
        tabIndex={0}
        role="region"
        aria-label={label ?? `${language} code`}
        className={cn(styles.code, styles.block, wrap && styles.wrap, className)}
        style={{
          maxHeight:
            maxHeight ??
            (maxLines ? `calc(${maxLines} * 1lh + 2 * var(--v4-space-surface-inset))` : undefined),
          ...style
        }}
      >
        <code ref={ref} data-language={normalizeCodeLanguage(language)} {...props}>
          {value.split("\n").map((line, index, lines) => (
            <React.Fragment key={index}>
              <span className={cn(styles.line, highlight.includes(index + 1) && styles.highlight)}>
                {lineNumbers && (
                  <span aria-hidden="true" className={styles.number}>
                    {index + 1}
                  </span>
                )}
                {tokenizeCode(line, format === "plain" ? "plain" : language).map(
                  (token, tokenIndex) => (
                    <span key={tokenIndex} className={styles[`token_${token.kind}`]}>
                      {token.text}
                    </span>
                  )
                )}
              </span>
              {index < lines.length - 1 ? "\n" : null}
            </React.Fragment>
          ))}
        </code>
      </pre>
    );
  }
);
Code.displayName = "Code";
