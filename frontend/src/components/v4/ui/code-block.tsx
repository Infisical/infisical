import * as React from "react";

import { FrameScope, useInFrame } from "../lib/frame-context";
import { cn } from "../lib/utils";
import { Code, type CodeProps } from "./code";
import { Icon, type IconName } from "./icon";
import { Json, type JsonProps, prepareJson } from "./json";
import { MiddleTruncate } from "./middle-truncate";
import { CopyButton } from "./sensitive-editor";

import styles from "./code.module.css";
import frame from "./frame.module.css";

export type CodeBlockProps = Omit<CodeProps, "children" | "block" | "onCopy" | "label"> & {
  children?: React.ReactNode;
  label?: React.ReactNode;
  icon?: IconName;
  actions?: React.ReactNode;
  copyable?: boolean;
  copyValue?: string;
  copyLabel?: string;
  onCopy?: (value: string) => void;
  writeClipboard?: (value: string) => Promise<void>;
};
export const CodeBlock = ({
  children,
  code,
  label,
  icon,
  actions,
  copyable = true,
  copyValue,
  copyLabel = "Copy code",
  onCopy,
  writeClipboard,
  className,
  ...props
}: CodeBlockProps) => {
  const json =
    React.isValidElement<JsonProps>(children) && children.type === Json ? children : null;
  const source = json
    ? prepareJson(json.props.value, json.props.redact).text
    : (copyValue ?? code ?? (typeof children === "string" ? children : ""));
  const hasCopySource =
    Boolean(json) || copyValue !== undefined || code !== undefined || typeof children === "string";
  const embedded = useInFrame("CodeBlock");
  const labelText = typeof label === "string" ? label : undefined;
  const identityId = React.useId();
  return (
    <section
      data-slot="code-block"
      aria-label={labelText}
      aria-labelledby={label && !labelText ? identityId : undefined}
      data-embedded={embedded || undefined}
      className={cn(!embedded && frame.frame, styles.codeBlock, className)}
    >
      <FrameScope framed>
        {(label || actions || copyable) && (
          <div className={styles.header} data-has-actions={Boolean(actions) || undefined}>
            <div id={identityId} className={styles.identity}>
              {icon && <Icon name={icon} />}
              {labelText ? (
                <MiddleTruncate keepEnd={16} className={styles.blockLabel}>
                  {labelText}
                </MiddleTruncate>
              ) : (
                label
              )}
            </div>
            {actions && <div className={styles.actions}>{actions}</div>}
            {copyable && (
              <CopyButton
                value={source}
                disabled={!hasCopySource}
                label={copyLabel}
                iconOnly
                onCopy={onCopy}
                writeClipboard={writeClipboard}
              />
            )}
          </div>
        )}
        <div className={cn(frame.frameInset, styles.body)}>
          {json ??
            (typeof children === "string" || children === undefined ? (
              <Code block code={code ?? children} label={labelText} {...props} />
            ) : (
              <div className={styles.customContent}>{children}</div>
            ))}
        </div>
      </FrameScope>
    </section>
  );
};
