"use client";

import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "@app/components/v4/lib/utils";

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid w-full gap-2", className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "group/radio-group-item peer relative flex aspect-square size-4 shrink-0 rounded-full border border-v4-control outline-none group-has-[:focus-visible]/field-label:outline-0 group-has-[:focus-visible]/field-label:not-data-checked:border-v4-control after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v4-ink focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-v4-bad aria-invalid:aria-checked:border-primary data-checked:border-primary data-checked:bg-primary data-checked:text-v4-on-ink group-has-[:focus-visible]/field-label:data-checked:border-primary dark:bg-v4-control/30 dark:aria-invalid:border-v4-bad/50 dark:data-checked:bg-primary",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-4 items-center justify-center"
      >
        <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-v4-on-ink" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
