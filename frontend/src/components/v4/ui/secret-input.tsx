"use client";

import * as React from "react";

import { useFieldControlAttributes } from "../lib/field-context";
import { getInvisibleCharacterSummary } from "../lib/invisible-characters";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Tooltip } from "./tooltip";

import geometry from "./button-geometry.module.css";
import controlStyles from "./controls.module.css";
import styles from "./secret-input.module.css";

export const HIDDEN_SECRET_VALUE = "••••••••••••••••";

export type SecretInputProps = Omit<
  React.ComponentProps<"textarea">,
  "value" | "defaultValue" | "onChange" | "rows"
> & {
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  invalid?: boolean;
};

export function SecretInput({
  value,
  onChange,
  multiline = false,
  invalid,
  className,
  onFocus,
  onBlur,
  ref,
  ...props
}: SecretInputProps) {
  const field = useFieldControlAttributes(props);
  const [focused, setFocused] = React.useState(false);
  const warningId = React.useId();
  const invisible = React.useMemo(() => getInvisibleCharacterSummary(value), [value]);
  const masked = !focused && value !== "";
  const labelled = Boolean(props["aria-label"] || field.id || field["aria-labelledby"]);
  return (
    <span
      data-slot="secret-input"
      data-size="sm"
      data-multiline={multiline || undefined}
      data-masked={masked || undefined}
      className={cn(controlStyles.field, controlStyles.fieldBox, styles.box, className)}
    >
      <textarea
        ref={ref}
        data-field-control=""
        rows={multiline ? 3 : 1}
        spellCheck={false}
        autoComplete="off"
        aria-label={labelled ? undefined : "Secret value"}
        className={cn(controlStyles.bare, styles.text)}
        {...props}
        {...field}
        aria-invalid={invalid || field["aria-invalid"] || undefined}
        aria-describedby={
          [field["aria-describedby"], invisible.length > 0 ? warningId : undefined]
            .filter(Boolean)
            .join(" ") || undefined
        }
        value={masked ? HIDDEN_SECRET_VALUE : value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
      />
      {invisible.length > 0 && (
        <span className={controlStyles.trailing}>
          <span id={warningId} className="sr-only">
            Contains invisible characters
          </span>
          <Tooltip
            align="end"
            content={
              <>
                <span className={styles.warningLine}>
                  This value contains invisible characters that can break it when used:
                </span>
                {invisible.map(({ codePoint, label, count }) => (
                  <span key={codePoint} className={styles.warningLine}>
                    {count}x {label} ({codePoint})
                  </span>
                ))}
              </>
            }
          >
            <Button
              type="button"
              variant="ghost"
              iconOnly
              icon="alert"
              className={cn(geometry.nestedAction, styles.warning)}
            >
              Value contains invisible characters
            </Button>
          </Tooltip>
        </span>
      )}
    </span>
  );
}
