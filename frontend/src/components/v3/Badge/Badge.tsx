import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "cva";
import { LucideIcon } from "lucide-react";

import { cn } from "@app/components/v3/utils";

const badgeVariants = cva(
  "inline-flex items-center [a&]:cursor-pointer justify-center rounded-[3px] border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default: "border-foreground bg-foreground text-background [a&]:hover:bg-foreground/90",
        outline: "text-foreground [a&]:hover:bg-foreground/30",
        secrets:
          "border-secrets/75 bg-secrets/30 text-foreground [a&]:hover:bg-secrets/40 [a&]:hover:border-secrets",
        scanning:
          "border-scanning/75 bg-scanning/30 text-foreground [a&]:hover:bg-scanning/40 [a&]:hover:border-scanning",
        pki: "border-pki/75 bg-pki/30 text-foreground [a&]:hover:bg-pki/40 [a&]:hover:border-pki",
        ssh: "border-ssh/75 bg-ssh/30 text-foreground [a&]:hover:bg-ssh/40 [a&]:hover:border-ssh",
        pam: "border-pam/75 bg-pam/30 text-foreground [a&]:hover:bg-pam/40 [a&]:hover:border-pam",
        kms: "border-kms/75 bg-kms/30 text-foreground [a&]:hover:bg-kms/40 [a&]:hover:border-kms",
        success:
          "border-success/75 bg-success/30 text-foreground [a&]:hover:bg-success/40 [a&]:hover:border-success",
        info: "border-info/75 bg-info/30 text-foreground [a&]:hover:bg-info/40 [a&]:hover:border-info",
        warning:
          "border-warning/75 bg-warning/30 text-foreground [a&]:hover:bg-warning/40 [a&]:hover:border-warning",
        danger:
          "border-danger/75 bg-danger/30 text-foreground [a&]:hover:bg-danger/40 [a&]:hover:border-danger"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  children,
  leftIcon,
  rightIcon,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
    leftIcon?: LucideIcon;
    rightIcon?: LucideIcon;
  }) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props}>
      {leftIcon &&
        React.createElement(leftIcon, {
          size: 14,
          "aria-hidden": true,
          strokeWidth: 2.5
        })}
      {children}
      {rightIcon &&
        React.createElement(rightIcon, {
          size: 14,
          "aria-hidden": true,
          strokeWidth: 2.5
        })}
    </Comp>
  );
}
export { Badge, badgeVariants };
