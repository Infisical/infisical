import * as React from "react";
import { CheckIcon, MinusIcon } from "lucide-react";
import { motion } from "motion/react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { useFieldControlAttributes } from "../lib/field-context";
import { exit, fade, motionMs } from "../lib/motion";
import { useControllableState } from "../lib/use-controllable-state";
import { cn } from "../lib/utils";

import controlStyles from "./controls.module.css";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  Omit<React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, "onChange"> & {
    label?: string;
    description?: string;
    indeterminate?: boolean;
    onChange?: (checked: boolean) => void;
  }
>(({ className, label, description, indeterminate, onChange, onCheckedChange, ...props }, ref) => {
  const generated = React.useId();
  const titleId = `${generated}-title`;
  const descriptionId = `${generated}-description`;
  const fieldAttributes = useFieldControlAttributes(props);
  const [checked, setChecked] = useControllableState<CheckboxPrimitive.CheckedState>({
    value: props.checked,
    defaultValue: props.defaultChecked ?? false
  });
  const drawn = checked === true && !indeterminate;
  const control = (
    <CheckboxPrimitive.Root
      ref={ref}
      data-slot="checkbox"
      className={cn(
        "peer relative flex shrink-0 items-center justify-center group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 disabled:cursor-not-allowed disabled:opacity-50",
        controlStyles.focusOutline,
        controlStyles.choiceMark,
        controlStyles.check,
        className
      )}
      {...props}
      {...fieldAttributes}
      id={fieldAttributes.id ?? generated}
      aria-labelledby={label ? titleId : fieldAttributes["aria-labelledby"]}
      aria-describedby={
        [fieldAttributes["aria-describedby"], label && description ? descriptionId : undefined]
          .filter(Boolean)
          .join(" ") || undefined
      }
      onCheckedChange={(next) => {
        setChecked(next);
        onCheckedChange?.(next);
        onChange?.(next === true);
      }}
      checked={indeterminate ? "indeterminate" : props.checked}
    >
      <CheckboxPrimitive.Indicator
        forceMount
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <motion.span
          data-check
          aria-hidden
          className="grid place-content-center [&>svg]:size-3.5"
          initial={false}
          animate={{
            clipPath: drawn ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)",
            opacity: drawn ? 1 : 0
          }}
          transition={{
            clipPath: drawn ? fade.enter : exit.fast,
            opacity: { duration: 0, delay: drawn ? 0 : motionMs.exit.fast / 1000 }
          }}
        >
          <CheckIcon strokeWidth={2} />
        </motion.span>
        <MinusIcon data-mixed />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
  return label ? (
    <label htmlFor={fieldAttributes.id ?? generated} className={controlStyles.choice}>
      {control}
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
    </label>
  ) : (
    control
  );
});
Checkbox.displayName = "Checkbox";

export { Checkbox };
