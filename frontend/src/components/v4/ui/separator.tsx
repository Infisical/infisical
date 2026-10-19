"use client";

import * as React from "react";
import { Separator as SeparatorPrimitive } from "radix-ui";

import { cn } from "../lib/utils";

import controlStyles from "./controls.module.css";

const Separator = React.forwardRef<
  React.ComponentRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root> & {
    label?: React.ReactNode;
    align?: "start" | "center";
    soft?: boolean;
  }
>(
  (
    {
      className,
      orientation = "horizontal",
      decorative = false,
      label,
      align = "center",
      soft = false,
      ...props
    },
    ref
  ) => {
    if (label)
      return (
        <div
          data-slot="separator-label"
          data-align={align}
          className={controlStyles.separatorLabel}
        >
          <Separator
            ref={ref}
            decorative={decorative}
            className={align === "start" ? controlStyles.separatorLead : undefined}
            soft={soft}
            {...props}
          />
          <span>{label}</span>
          <Separator decorative soft={soft} />
        </div>
      );
    return (
      <SeparatorPrimitive.Root
        ref={ref}
        data-slot="separator"
        decorative={decorative}
        orientation={orientation}
        className={cn(
          "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
          soft && controlStyles.separatorSoft,
          className
        )}
        {...props}
      />
    );
  }
);
Separator.displayName = "Separator";

export { Separator };
