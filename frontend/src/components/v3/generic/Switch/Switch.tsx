/* eslint-disable react/prop-types */

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { twMerge } from "tailwind-merge";

import { cn } from "../../utils";

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:pointer-events-none",
        "dark:data-unchecked:bg-input/80 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-[size=default]:h-[18.4px]",
        "data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] data-[state=checked]:bg-project/5",
        "peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border data-[state=checked]:hover:border-project/25",
        "border-border bg-transparent transition-all outline-none after:absolute after:-inset-x-3 hover:border-foreground/25 data-[state=checked]:border-project/20 data-[state=checked]:hover:bg-project/15",
        "after:-inset-y-2 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:ring-[3px] data-checked:bg-primary",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={twMerge(
          "pointer-events-none block rounded-full border border-project/15 bg-project/35 ring-0 transition-all data-[state=checked]:group-hover/switch:bg-project/35",
          "ml-0.5 group-data-[size=default]/switch:size-3.5 group-data-[size=sm]/switch:size-3 data-[state=unchecked]:group-hover/switch:bg-foreground/35 group-data-[size=default]/switch:data-[state=unchecked]:translate-x-0",
          "group-data-[size=default]/switch:data-[state=checked]:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-[state=checked]:translate-x-[calc(100%-2px)]",
          "data-[state=unchecked]:border-foreground/5 data-[state=unchecked]:bg-foreground/15 group-data-[size=sm]/switch:data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  );
}
export { Switch };
