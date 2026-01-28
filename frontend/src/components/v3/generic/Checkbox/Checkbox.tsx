/* eslint-disable react/prop-types */
import * as React from "react";
import { CheckboxIndicator, Root as CheckboxPrimitive } from "@radix-ui/react-checkbox";
import { cva, VariantProps } from "cva";
import { CheckIcon, MinusIcon } from "lucide-react";

import { cn } from "../../utils";

const checkboxVariants = cva(
  cn(
    "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
    "outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2",
    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed",
    "disabled:opacity-50 cursor-pointer",
    "aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20",
    "dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
    "border-foreground/15 inner-shadow text-foreground hover:bg-foreground/10 hover:border-foreground/20"
  ),
  {
    variants: {
      variant: {
        outline:
          "data-[state=checked]:border-border data-[state=checked]:bg-foreground/10 data-[state=checked]:text-foreground data-[state=checked]:hover:bg-foreground/15 data-[state=checked]:hover:border-foreground/30",
        neutral:
          "data-[state=checked]:border-neutral/25 data-[state=checked]:bg-neutral/10 data-[state=checked]:text-foreground data-[state=checked]:hover:bg-neutral/15 data-[state=checked]:hover:border-neutral/30",
        project:
          "data-[state=checked]:border-project/25 data-[state=checked]:bg-project/10 data-[state=checked]:text-foreground data-[state=checked]:hover:bg-project/15 data-[state=checked]:hover:border-project/30",
        org: "data-[state=checked]:border-org/25 data-[state=checked]:bg-org/10 data-[state=checked]:text-foreground data-[state=checked]:hover:bg-org/15 data-[state=checked]:hover:border-org/30",
        "sub-org":
          "data-[state=checked]:border-sub-org/25 data-[state=checked]:bg-sub-org/10 data-[state=checked]:text-foreground data-[state=checked]:hover:bg-sub-org/15 data-[state=checked]:hover:border-sub-org/30",
        success:
          "data-[state=checked]:border-success/25 data-[state=checked]:bg-success/10 data-[state=checked]:text-foreground data-[state=checked]:hover:bg-success/15 data-[state=checked]:hover:border-success/30",
        info: "data-[state=checked]:border-info/25 data-[state=checked]:bg-info/10 data-[state=checked]:text-foreground data-[state=checked]:hover:bg-info/15 data-[state=checked]:hover:border-info/30",
        warning:
          "data-[state=checked]:border-warning/25 data-[state=checked]:bg-warning/10 data-[state=checked]:text-foreground data-[state=checked]:hover:bg-warning/15 data-[state=checked]:hover:border-warning/30",
        danger:
          "data-[state=checked]:border-danger/25 data-[state=checked]:bg-danger/10 data-[state=checked]:text-foreground data-[state=checked]:hover:bg-danger/15 data-[state=checked]:hover:border-danger/30"
      }
    },
    defaultVariants: {
      variant: "outline"
    }
  }
);

type CheckboxProps = Omit<
  React.ComponentProps<typeof CheckboxPrimitive>,
  "checked" | "disabled" | "required"
> &
  VariantProps<typeof checkboxVariants> & {
    isDisabled?: boolean;
    isIndeterminate?: boolean;
    isChecked?: boolean;
    isRequired?: boolean;
  };

function Checkbox({
  className,
  variant,
  isDisabled,
  isIndeterminate,
  isChecked,
  isRequired,
  ...props
}: CheckboxProps) {
  return (
    <CheckboxPrimitive
      data-slot="checkbox"
      className={cn(checkboxVariants({ variant }), className)}
      {...props}
      checked={isChecked}
      disabled={isDisabled}
      required={isRequired}
    >
      <CheckboxIndicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        {isIndeterminate ? <MinusIcon /> : <CheckIcon />}
      </CheckboxIndicator>
    </CheckboxPrimitive>
  );
}

export { Checkbox };
