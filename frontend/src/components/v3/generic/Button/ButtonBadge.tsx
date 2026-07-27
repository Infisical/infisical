import { forwardRef } from "react";
import { cva, type VariantProps } from "cva";

import { cn } from "../../utils";
import { Badge, type TBadgeProps } from "../Badge";

const buttonBadgeBackgrounds: Partial<Record<NonNullable<TBadgeProps["variant"]>, string>> = {
  neutral: "bg-[color-mix(in_srgb,var(--color-neutral)_15%,var(--color-card))]",
  success: "bg-[color-mix(in_srgb,var(--color-success)_15%,var(--color-card))]",
  info: "bg-[color-mix(in_srgb,var(--color-info)_15%,var(--color-card))]",
  warning: "bg-[color-mix(in_srgb,var(--color-warning)_15%,var(--color-card))]",
  danger: "bg-[color-mix(in_srgb,var(--color-danger)_15%,var(--color-card))]",
  project: "bg-[color-mix(in_srgb,var(--color-project)_15%,var(--color-card))]",
  org: "bg-[color-mix(in_srgb,var(--color-org)_15%,var(--color-card))]",
  "sub-org": "bg-[color-mix(in_srgb,var(--color-sub-org)_15%,var(--color-card))]",
  pam: "bg-[color-mix(in_srgb,var(--color-product-pam)_15%,var(--color-card))]"
};

const buttonBadgeVariants = cva("pointer-events-none absolute z-10", {
  variants: {
    position: {
      "top-right": "-top-3 -right-4",
      "top-left": "-top-3 -left-2"
    }
  },
  defaultVariants: {
    position: "top-right"
  }
});

type ButtonBadgeProps = TBadgeProps & VariantProps<typeof buttonBadgeVariants>;

const ButtonBadge = forwardRef<HTMLSpanElement, ButtonBadgeProps>(
  ({ className, position = "top-right", variant = "default", ...props }, ref) => (
    <Badge
      ref={ref}
      data-slot="button-badge"
      variant={variant}
      className={cn(
        buttonBadgeVariants({ position }),
        variant && buttonBadgeBackgrounds[variant],
        className
      )}
      {...props}
    />
  )
);

ButtonBadge.displayName = "ButtonBadge";

export { ButtonBadge, type ButtonBadgeProps, buttonBadgeVariants };
