import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";

import controlStyles from "./controls.module.css";
import helperStyles from "./helpers.module.css";

const badgeVariants = cva([
  controlStyles.focusOutline,
  helperStyles.badge,
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3!"
]);

export type BadgeTone = "outline" | "soft" | "ok" | "warn" | "bad" | "info" | "solid" | "accent";
type LegacyBadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";
const legacyTone: Record<LegacyBadgeVariant, BadgeTone> = {
  default: "solid",
  secondary: "soft",
  destructive: "bad",
  outline: "outline",
  ghost: "outline",
  link: "outline"
};

const Badge = React.forwardRef<
  React.ComponentRef<"span">,
  React.ComponentPropsWithoutRef<"span"> & {
    asChild?: boolean;
    tone?: BadgeTone;
    /** @deprecated Use tone. Each value maps to a tone: default solid, secondary soft, destructive bad, the rest outline. */
    variant?: LegacyBadgeVariant;
    dot?: boolean;
    size?: "sm" | "md";
    mono?: boolean;
  }
>(
  (
    {
      className,
      variant,
      tone,
      dot = false,
      size = "md",
      mono = false,
      children,
      asChild = false,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot.Root : "span";
    const dotNode = dot ? <span aria-hidden="true" className={helperStyles.badgeDot} /> : null;
    const body =
      asChild && React.isValidElement<{ children?: React.ReactNode }>(children) ? (
        React.cloneElement(
          children,
          undefined,
          <>
            {dotNode}
            {children.props.children}
          </>
        )
      ) : (
        <>
          {dotNode}
          {children}
        </>
      );

    return (
      <Comp
        ref={ref}
        data-slot="badge"
        data-tone={tone ?? (variant ? legacyTone[variant] : "outline")}
        data-size={size}
        className={cn(badgeVariants(), mono && helperStyles.mono, className)}
        {...props}
      >
        {body}
      </Comp>
    );
  }
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };

export const Count = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<"span"> & { tone?: "accent" | "ink" | "neutral" }
>(({ tone = "accent", className, ...props }, ref) => (
  <span
    ref={ref}
    data-slot="count"
    data-tone={tone}
    className={cn(
      helperStyles.count,
      tone === "ink" && helperStyles.countInk,
      tone === "neutral" && helperStyles.countNeutral,
      className
    )}
    {...props}
  />
));
Count.displayName = "Count";
