import * as React from "react";
import { cn } from "cn";

import { Code, type CodeProps } from "./code";
import { Icon, type IconName } from "./icon";
import { Json, type JsonProps, prepareJson } from "./json";
import { MiddleTruncate } from "./middle-truncate";
import { CopyButton } from "./sensitive-editor";

import styles from "./code.module.css";

export type CodeBlockProps = Omit<CodeProps, "children" | "block" | "onCopy"> & {
  children?: React.ReactNode;
  label?: string;
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
  return (
    <div data-slot="code-block" className={cn(styles.frame, className)}>
      {(label || actions || copyable) && (
        <div className={styles.header}>
          <div className={styles.identity}>
            {icon && <Icon name={icon} />}
            {label && (
              <MiddleTruncate keepEnd={16} className={styles.blockLabel}>
                {label}
              </MiddleTruncate>
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
      {json ??
        (typeof children === "string" || children === undefined ? (
          <Code block code={code ?? children} {...props} />
        ) : (
          <div className={styles.customContent}>{children}</div>
        ))}
    </div>
  );
};
