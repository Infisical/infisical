/* eslint-disable react/prop-types */

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cva, VariantProps } from "cva";

import { cn } from "../../utils";

const switchVariants = cva(
  cn(
    "peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border transition-all",
    "outline-none after:absolute after:-inset-x-3 after:-inset-y-2",
    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    "data-[size=default]:h-[18.4px] data-[size=default]:w-[32px]",
    "data-[size=sm]:h-[14px] data-[size=sm]:w-[24px]",
    "border-border bg-transparent hover:border-foreground/25",
    "aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20",
    "dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
  ),
  {
    variants: {
      variant: {
        outline:
          "data-[state=checked]:border-border data-[state=checked]:bg-foreground/5 data-[state=checked]:hover:bg-foreground/15 data-[state=checked]:hover:border-foreground/30",
        neutral:
          "data-[state=checked]:border-neutral/15 data-[state=checked]:bg-neutral/5 data-[state=checked]:hover:bg-neutral/15 data-[state=checked]:hover:border-neutral/30",
        project:
          "data-[state=checked]:border-project/15 data-[state=checked]:bg-project/5 data-[state=checked]:hover:bg-project/15 data-[state=checked]:hover:border-project/30",
        org: "data-[state=checked]:border-org/15 data-[state=checked]:bg-org/5 data-[state=checked]:hover:bg-org/15 data-[state=checked]:hover:border-org/30",
        "sub-org":
          "data-[state=checked]:border-sub-org/15 data-[state=checked]:bg-sub-org/5 data-[state=checked]:hover:bg-sub-org/15 data-[state=checked]:hover:border-sub-org/30",
        success:
          "data-[state=checked]:border-success/15 data-[state=checked]:bg-success/5 data-[state=checked]:hover:bg-success/15 data-[state=checked]:hover:border-success/30",
        info: "data-[state=checked]:border-info/15 data-[state=checked]:bg-info/5 data-[state=checked]:hover:bg-info/15 data-[state=checked]:hover:border-info/30",
        warning:
          "data-[state=checked]:border-warning/15 data-[state=checked]:bg-warning/5 data-[state=checked]:hover:bg-warning/15 data-[state=checked]:hover:border-warning/30",
        danger:
          "data-[state=checked]:border-danger/15 data-[state=checked]:bg-danger/5 data-[state=checked]:hover:bg-danger/15 data-[state=checked]:hover:border-danger/30"
      }
    },
    defaultVariants: {
      variant: "outline"
    }
  }
);

const switchThumbVariants = cva(
  cn(
    "pointer-events-none block rounded-full ring-0 transition-all",
    "ml-0.5 group-data-[size=default]/switch:size-3.5 group-data-[size=sm]/switch:size-2.5",
    "group-data-[size=default]/switch:data-[state=unchecked]:translate-x-0",
    "group-data-[size=default]/switch:data-[state=checked]:translate-x-[calc(100%-2px)]",
    "group-data-[size=sm]/switch:data-[state=unchecked]:translate-x-0",
    "group-data-[size=sm]/switch:data-[state=checked]:translate-x-[calc(100%-2px)]",
    "data-[state=unchecked]:border-foreground/5 data-[state=unchecked]:bg-foreground/15",
    "data-[state=unchecked]:group-hover/switch:bg-foreground/35"
  ),
  {
    variants: {
      variant: {
        outline:
          "data-[state=checked]:border-foreground/10 data-[state=checked]:bg-foreground/35 data-[state=checked]:group-hover/switch:bg-foreground/45",
        neutral:
          "data-[state=checked]:border-neutral/10 data-[state=checked]:bg-neutral/35 data-[state=checked]:group-hover/switch:bg-neutral/45",
        project:
          "data-[state=checked]:border-project/10 data-[state=checked]:bg-project/35 data-[state=checked]:group-hover/switch:bg-project/45",
        org: "data-[state=checked]:border-org/10 data-[state=checked]:bg-org/35 data-[state=checked]:group-hover/switch:bg-org/45",
        "sub-org":
          "data-[state=checked]:border-sub-org/10 data-[state=checked]:bg-sub-org/35 data-[state=checked]:group-hover/switch:bg-sub-org/45",
        success:
          "data-[state=checked]:border-success/10 data-[state=checked]:bg-success/35 data-[state=checked]:group-hover/switch:bg-success/45",
        info: "data-[state=checked]:border-info/10 data-[state=checked]:bg-info/35 data-[state=checked]:group-hover/switch:bg-info/45",
        warning:
          "data-[state=checked]:border-warning/10 data-[state=checked]:bg-warning/35 data-[state=checked]:group-hover/switch:bg-warning/45",
        danger:
          "data-[state=checked]:border-danger/10 data-[state=checked]:bg-danger/35 data-[state=checked]:group-hover/switch:bg-danger/45"
      }
    },
    defaultVariants: {
      variant: "outline"
    }
  }
);

type SwitchProps = React.ComponentProps<typeof SwitchPrimitive.Root> &
  VariantProps<typeof switchVariants> & {
    size?: "sm" | "default";
  };

function Switch({ className, variant, size = "default", ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(switchVariants({ variant }), className)}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(switchThumbVariants({ variant }), "border")}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
