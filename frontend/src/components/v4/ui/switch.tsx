import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { useFieldControlAttributes } from "../lib/field-context";
import { snap, spring } from "../lib/motion";
import { useControllableState } from "../lib/use-controllable-state";
import { cn } from "../lib/utils";
import { Tooltip } from "./tooltip";

import controlStyles from "./controls.module.css";

const thumbGeometry = {
  default: { size: 14, travel: 16, hover: 2, press: 4, shrink: 2 },
  sm: { size: 10, travel: 12, hover: 2, press: 3, shrink: 2 }
} as const;

function Switch({
  className,
  size = "default",
  label,
  description,
  layout = "default",
  disabledReason,
  onChange,
  onClick,
  onCheckedChange,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  ref,
  ...props
}: Omit<React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>, "onChange"> & {
  label?: React.ReactNode;
  description?: React.ReactNode;
  layout?: "default" | "row";
  /** Blocks the switch and says why: it stays focusable, shows the reason in a tooltip and exposes it as the accessible description. */
  disabledReason?: string;
  onChange?: (checked: boolean) => void;
} & {
  size?: "sm" | "default";
} & { ref?: React.Ref<React.ComponentRef<typeof SwitchPrimitive.Root>> }) {
  const reduced = useReducedMotion();
  const reason = disabledReason || undefined;
  const inactive = Boolean(props.disabled || reason);
  const [hovered, setHovered] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);
  const [checked, setChecked] = useControllableState({
    value: props.checked,
    defaultValue: props.defaultChecked ?? false
  });
  React.useEffect(() => {
    if (!pressed) return undefined;
    const release = () => setPressed(false);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, [pressed]);
  const geometry = thumbGeometry[size];
  const extra = inactive ? 0 : pressed ? geometry.press : hovered ? geometry.hover : 0;
  const shrink = pressed && !inactive ? geometry.shrink : 0;
  const generated = React.useId();
  const titleId = `${generated}-title`;
  const descriptionId = `${generated}-description`;
  const reasonId = `${generated}-reason`;
  const fieldAttributes = useFieldControlAttributes(props);
  const control = (
    <SwitchPrimitive.Root
      ref={ref}
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center after:absolute after:-inset-x-3 after:-inset-y-2 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        controlStyles.focusOutline,
        controlStyles.switch,
        className
      )}
      {...props}
      {...fieldAttributes}
      disabled={reason ? undefined : props.disabled}
      data-disabled={inactive ? "" : undefined}
      data-disabled-reason={reason ? "" : undefined}
      aria-disabled={inactive || undefined}
      id={fieldAttributes.id ?? generated}
      aria-labelledby={label ? titleId : fieldAttributes["aria-labelledby"]}
      aria-describedby={
        [
          fieldAttributes["aria-describedby"],
          reason ? reasonId : undefined,
          label && description ? descriptionId : undefined
        ]
          .filter(Boolean)
          .join(" ") || undefined
      }
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
        onPointerEnter?.(event);
      }}
      onPointerLeave={(event) => {
        setHovered(false);
        onPointerLeave?.(event);
      }}
      onPointerDown={(event) => {
        setPressed(true);
        onPointerDown?.(event);
      }}
      onClick={(event) => {
        if (reason) event.preventDefault();
        onClick?.(event);
      }}
      onCheckedChange={(next) => {
        setChecked(next);
        onCheckedChange?.(next);
        onChange?.(next === true);
      }}
    >
      <SwitchPrimitive.Thumb asChild>
        <motion.span
          data-slot="switch-thumb"
          className={cn("pointer-events-none block", controlStyles.switchThumb)}
          initial={false}
          layout
          layoutDependency={`${checked},${extra},${shrink}`}
          style={{
            marginLeft: checked ? geometry.travel - extra : 0,
            width: geometry.size + extra,
            height: geometry.size - shrink
          }}
          transition={{ layout: reduced ? snap : spring.moderate }}
        />
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  );
  const anchored = reason ? (
    <>
      <Tooltip content={reason}>
        <span data-slot="switch-anchor" className={controlStyles.switchAnchor}>
          {control}
        </span>
      </Tooltip>
      <span id={reasonId} className="sr-only">
        {reason}
      </span>
    </>
  ) : (
    control
  );
  return label ? (
    <label
      htmlFor={fieldAttributes.id ?? generated}
      className={cn(controlStyles.choice, layout === "row" && controlStyles.choiceRow)}
    >
      {layout !== "row" && anchored}
      <span className={controlStyles.choiceText}>
        <span id={titleId} className={controlStyles.choiceTitle}>
          {label}
        </span>
        {description && (
          <span id={descriptionId} className={controlStyles.choiceDescription}>
            {description}
          </span>
        )}
      </span>
      {layout === "row" && anchored}
    </label>
  ) : (
    anchored
  );
}
Switch.displayName = "Switch";

export { Switch };
