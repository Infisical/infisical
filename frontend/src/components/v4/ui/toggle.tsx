"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Toggle as TogglePrimitive } from "radix-ui";

import { cn } from "../lib/utils";

import geometry from "./button-geometry.module.css";
import material from "./button-material.module.css";
import controlStyles from "./controls.module.css";

const toggleVariants = cva(
  [
    geometry.button,
    controlStyles.focusOutline,
    controlStyles.toggle,
    material.paintTransition,
    material.neutralSelection,
    "group/toggle inline-flex items-center justify-center whitespace-nowrap [&_svg]:pointer-events-none [&_svg]:shrink-0"
  ],
  {
    variants: {
      variant: {
        outline: controlStyles.toggleOutline,
        default: controlStyles.toggleOutline,
        ghost: controlStyles.toggleGhost
      },
      size: {
        default: geometry.default,
        sm: geometry.default,
        md: geometry.regular,
        lg: geometry.large
      }
    },
    defaultVariants: {
      variant: "outline",
      size: "default"
    }
  }
);

const Toggle = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>
>(({ className, variant = "outline", size = "default", ...props }, ref) => {
  return (
    <TogglePrimitive.Root
      ref={ref}
      data-slot="toggle"
      data-variant={variant === "default" ? "outline" : variant}
      data-size={size}
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
});
Toggle.displayName = "Toggle";

export { Toggle, toggleVariants };
