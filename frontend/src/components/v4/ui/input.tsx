import * as React from "react";
import { cn } from "cn";

import { useFieldControlAttributes } from "../lib/field-context";
import { Icon, type IconName } from "./icon";
import { Kbd } from "./kbd";

import styles from "./controls.module.css";

export type InputProps = Omit<React.ComponentPropsWithoutRef<"input">, "size"> & {
  size?: number | "sm" | "md" | "lg";
  icon?: IconName;
  mono?: boolean;
  invalid?: boolean;
  kbd?: string;
  trailing?: React.ReactNode;
};
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size = "sm", icon, mono = false, invalid, kbd, trailing, ...props }, ref) => {
    const field = useFieldControlAttributes(props);
    const inner = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => inner.current as HTMLInputElement);
    const fieldSize = typeof size === "number" ? "sm" : size;
    const leading = icon ?? (props.readOnly ? "lock" : undefined);
    const boxed = Boolean(leading || kbd || trailing);
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
        className={cn(styles.field, styles.fieldBox)}
        data-size={fieldSize}
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
);
Input.displayName = "Input";
