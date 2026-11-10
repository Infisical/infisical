"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { exit, spring } from "../lib/motion";
import { useControllableState } from "../lib/use-controllable-state";
import { cn } from "../lib/utils";

import controlStyles from "./controls.module.css";

const RadioValueContext = React.createContext<string | undefined>(undefined);

function RadioGroup({
  className,
  value,
  defaultValue,
  onValueChange,
  ref,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  const [current, setCurrent] = useControllableState<string | undefined>({
    value: value ?? undefined,
    defaultValue: defaultValue ?? undefined,
    onChange: (next) => next !== undefined && onValueChange?.(next)
  });
  return (
    <RadioValueContext value={current}>
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
    </RadioValueContext>
  );
}
RadioGroup.displayName = "RadioGroup";

function RadioGroupItem({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
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
}
RadioGroupItem.displayName = "RadioGroupItem";

function RadioGroupCard({
  className,
  title,
  description,
  media,
  ref,
  ...props
}: Omit<React.ComponentProps<typeof RadioGroupPrimitive.Item>, "title" | "children" | "asChild"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** An icon or logo inline before the title, sized to the title's line height and hidden from assistive technology; anything it means belongs in title. */
  media?: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const selected = React.useContext(RadioValueContext) === props.value;
  const generated = React.useId();
  const titleId = `${generated}-title`;
  const descriptionId = `${generated}-description`;
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      data-slot="radio-group-card"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        "disabled:cursor-not-allowed disabled:opacity-50",
        controlStyles.choiceCard,
        controlStyles.focusOutline,
        className
      )}
      {...props}
    >
      <span className={controlStyles.choiceCardMarkBox}>
        <span
          aria-hidden
          data-state={selected ? "checked" : "unchecked"}
          className={cn(controlStyles.choiceMark, controlStyles.choiceCardMark)}
        >
          <motion.span
            className={controlStyles.radioDot}
            initial={false}
            animate={{ scale: selected || reduced ? 1 : 0.3, opacity: selected ? 1 : 0 }}
            transition={selected ? spring.fast : exit.fast}
          />
        </span>
      </span>
      <span className={controlStyles.choiceText}>
        <span className={controlStyles.choiceCardHead}>
          {media && (
            <span aria-hidden className={controlStyles.choiceCardMedia}>
              {media}
            </span>
          )}
          <span id={titleId} className={controlStyles.choiceTitle}>
            {title}
          </span>
        </span>
        {description && (
          <span id={descriptionId} className={controlStyles.choiceDescription}>
            {description}
          </span>
        )}
      </span>
    </RadioGroupPrimitive.Item>
  );
}
RadioGroupCard.displayName = "RadioGroupCard";

export { RadioGroup, RadioGroupCard, RadioGroupItem };
