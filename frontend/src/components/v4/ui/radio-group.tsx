"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { exit, spring } from "../lib/motion";
import { useControllableState } from "../lib/use-controllable-state";
import { cn } from "../lib/utils";

import controlStyles from "./controls.module.css";

const RadioValueContext = React.createContext<string | undefined>(undefined);

const RadioGroup = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, value, defaultValue, onValueChange, ...props }, ref) => {
  const [current, setCurrent] = useControllableState<string | undefined>({
    value: value ?? undefined,
    defaultValue: defaultValue ?? undefined,
    onChange: (next) => next !== undefined && onValueChange?.(next)
  });
  return (
    <RadioValueContext.Provider value={current}>
      <RadioGroupPrimitive.Root
        ref={ref}
        data-slot="radio-group"
        className={cn(controlStyles.radioGroup, "grid w-full gap-2", className)}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(next) => {
          setCurrent(next);
        }}
        {...props}
      />
    </RadioValueContext.Provider>
  );
});
RadioGroup.displayName = "RadioGroup";

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => {
  const reduced = useReducedMotion();
  const selected = React.useContext(RadioValueContext) === props.value;
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      data-slot="radio-group-item"
      className={cn(
        "group/radio-group-item peer relative flex aspect-square size-4 shrink-0 rounded-full after:absolute after:-inset-x-3 after:-inset-y-2 disabled:cursor-not-allowed disabled:opacity-50",
        controlStyles.focusOutline,
        controlStyles.choiceMark,
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        forceMount
        data-slot="radio-group-indicator"
        className="flex size-4 items-center justify-center"
      >
        <motion.span
          className={controlStyles.radioDot}
          initial={false}
          animate={{ scale: selected || reduced ? 1 : 0.3, opacity: selected ? 1 : 0 }}
          transition={selected ? spring.fast : exit.fast}
        />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
});
RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroup, RadioGroupItem };
