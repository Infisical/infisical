import * as React from "react";
import { cn } from "cn";

import styles from "./kbd.module.css";

export type KeyCombo = string | readonly string[] | readonly (readonly string[])[];
export interface KbdProps extends Omit<React.ComponentPropsWithoutRef<"kbd">, "children"> {
  children?: React.ReactNode;
  keys?: KeyCombo;
  /** sm is an alias of md: both render the 20px key cap. */
  size?: "sm" | "md";
  platform?: "auto" | "mac" | "other";
}
function splitCombo(value: string): string[] {
  const text = value.trim();
  if (!text) return [];
  if (text === "+") return ["+"];
  if (text.includes("+")) {
    const parts = text.split("+").filter(Boolean);
    if (text.endsWith("++")) parts.push("+");
    return parts;
  }
  return text
    .replace(/([⌘⇧⌥⌃])/g, "$1 ")
    .trim()
    .split(/\s+/);
}
export function shortcutSteps(keys: KeyCombo): readonly (readonly string[])[] {
  if (typeof keys === "string")
    return keys
      .split(/\s+then\s+/i)
      .map(splitCombo)
      .filter((step) => step.length > 0);
  if (!keys.length) return [];
  if (keys.every((key): key is string => typeof key === "string")) return [keys];
  return keys.filter((key): key is readonly string[] => Array.isArray(key));
}
function keyLabel(key: string, apple: boolean): { glyph: string; name: string } {
  const lower = key.toLowerCase();
  const names: Record<string, { glyph: string; name: string }> = {
    mod: apple ? { glyph: "⌘", name: "Command" } : { glyph: "Ctrl", name: "Control" },
    cmd: { glyph: "⌘", name: "Command" },
    command: { glyph: "⌘", name: "Command" },
    "⌘": { glyph: "⌘", name: "Command" },
    ctrl: apple ? { glyph: "⌃", name: "Control" } : { glyph: "Ctrl", name: "Control" },
    control: { glyph: "Ctrl", name: "Control" },
    "⌃": { glyph: "⌃", name: "Control" },
    shift: apple ? { glyph: "⇧", name: "Shift" } : { glyph: "Shift", name: "Shift" },
    "⇧": { glyph: "⇧", name: "Shift" },
    alt: apple ? { glyph: "⌥", name: "Option" } : { glyph: "Alt", name: "Alt" },
    option: { glyph: "⌥", name: "Option" },
    "⌥": { glyph: "⌥", name: "Option" },
    enter: { glyph: "↵", name: "Enter" },
    return: { glyph: "↵", name: "Enter" },
    "↵": { glyph: "↵", name: "Enter" },
    esc: { glyph: "Esc", name: "Escape" },
    escape: { glyph: "Esc", name: "Escape" },
    backspace: { glyph: "⌫", name: "Backspace" },
    "⌫": { glyph: "⌫", name: "Backspace" },
    up: { glyph: "↑", name: "Arrow up" },
    down: { glyph: "↓", name: "Arrow down" },
    left: { glyph: "←", name: "Arrow left" },
    right: { glyph: "→", name: "Arrow right" },
    "↑": { glyph: "↑", name: "Arrow up" },
    "↓": { glyph: "↓", name: "Arrow down" },
    "←": { glyph: "←", name: "Arrow left" },
    "→": { glyph: "→", name: "Arrow right" },
    space: { glyph: "Space", name: "Space" },
    tab: { glyph: "Tab", name: "Tab" },
    "+": { glyph: "+", name: "Plus" }
  };
  return (
    names[lower] ?? {
      glyph: key.length === 1 ? key.toUpperCase() : key,
      name: key.length === 1 ? key.toUpperCase() : key
    }
  );
}
const Kbd = React.forwardRef<HTMLElement, KbdProps>(
  ({ className, children, keys, size = "md", platform = "auto", ...props }, ref) => {
    const source = keys ?? (typeof children === "string" ? children : null);
    const apple =
      platform === "mac" ||
      (platform === "auto" &&
        typeof navigator !== "undefined" &&
        /Mac|iPhone|iPad|iPod/i.test(navigator.platform));
    if (source === null)
      return (
        <kbd
          ref={ref}
          data-slot="kbd"
          data-size={size}
          className={cn(styles.cap, className)}
          {...props}
        >
          {children}
        </kbd>
      );
    const steps = shortcutSteps(source).map((step) => step.map((key) => keyLabel(key, apple)));
    const label = steps.map((step) => step.map((key) => key.name).join(" ")).join(" then ");
    return (
      <kbd
        ref={ref}
        data-slot="kbd-group"
        data-size={size}
        role="group"
        aria-label={label}
        className={cn(styles.group, className)}
        {...props}
      >
        {steps.map((step, index) => (
          <React.Fragment key={index}>
            {index > 0 && (
              <span aria-hidden className={styles.then}>
                then
              </span>
            )}
            {step.map((key, i) => (
              <kbd
                key={`${key.name}-${i}`}
                aria-hidden
                data-slot="kbd"
                data-size={size}
                className={styles.cap}
              >
                {key.glyph}
              </kbd>
            ))}
          </React.Fragment>
        ))}
      </kbd>
    );
  }
);
Kbd.displayName = "Kbd";
const KbdGroup = React.forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<"span">>(
  ({ className, ...props }, ref) => (
    <span ref={ref} data-slot="kbd-group" className={cn(styles.group, className)} {...props} />
  )
);
KbdGroup.displayName = "KbdGroup";
export { Kbd, KbdGroup };
