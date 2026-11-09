import * as React from "react";

import { useDescendantFlags } from "../lib/descendant-flags";
import { useFieldControlAttributes } from "../lib/field-context";
import { cn } from "../lib/utils";
import { Icon, type IconName } from "./icon";
import { Kbd } from "./kbd";

import styles from "./controls.module.css";

const field = `.${styles.field}`;
/** The state a field box draws from its slotted control or nested field: focus, invalid, disabled and read-only. */
export const fieldBoxFlags = {
  "data-control-focus": `[data-field-control]:focus-visible, ${field}:is(:focus-visible, [aria-expanded="true"])`,
  "data-control-invalid": `:is([data-field-control], ${field})[aria-invalid="true"]`,
  "data-control-input-focus": "[data-field-control]:focus-visible",
  "data-control-invalid-focus": `[data-field-control][aria-invalid="true"]:focus-visible, ${field}[aria-invalid="true"]:is(:focus-visible, [aria-expanded="true"])`,
  "data-control-disabled": "[data-field-control]:disabled",
  "data-control-readonly": "[data-field-control][readonly]"
};
export const fieldBoxWatch = {
  attributes: ["aria-invalid", "aria-expanded", "disabled", "readonly"],
  focus: true
};

export type InputProps = Omit<React.ComponentPropsWithoutRef<"input">, "size"> & {
  size?: number | "xs" | "sm" | "md" | "lg";
  icon?: IconName;
  mono?: boolean;
  invalid?: boolean;
  kbd?: string;
  trailing?: React.ReactNode;
};
export function Input({
  className,
  type,
  size = "sm",
  icon,
  mono = false,
  invalid,
  kbd,
  trailing,
  ref,
  ...props
}: InputProps & { ref?: React.Ref<HTMLInputElement> }) {
  const field = useFieldControlAttributes(props);
  const inner = React.useRef<HTMLInputElement>(null);
  React.useImperativeHandle(ref, () => inner.current as HTMLInputElement);
  const fieldSize = typeof size === "number" ? "sm" : size;
  const leading = icon ?? (props.readOnly ? "lock" : undefined);
  const boxed = Boolean(leading || kbd || trailing);
  const boxRef = useDescendantFlags<HTMLSpanElement>(fieldBoxFlags, fieldBoxWatch);
  const input = (
    <input
      ref={inner}
      type={type}
      data-slot="input"
      data-size={fieldSize}
      data-field-control={boxed ? "" : undefined}
      size={typeof size === "number" ? size : undefined}
      className={cn(
        boxed ? styles.bare : [styles.field, "w-full min-w-0"],
        mono && styles.mono,
        className
      )}
      {...props}
      {...field}
      aria-invalid={invalid || field["aria-invalid"] || undefined}
    />
  );
  return boxed ? (
    <span
      ref={boxRef}
      className={cn(styles.field, styles.fieldBox)}
      data-size={fieldSize}
      data-field-box=""
      data-trailing={Boolean(kbd || trailing) || undefined}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        inner.current?.focus();
      }}
    >
      {leading && (
        <span className={styles.leading}>
          <Icon name={leading} />
        </span>
      )}
      {input}
      {(kbd || trailing) && (
        <span className={styles.trailing}>
          {kbd && <Kbd>{kbd}</Kbd>}
          {trailing}
        </span>
      )}
    </span>
  ) : (
    input
  );
}
Input.displayName = "Input";
