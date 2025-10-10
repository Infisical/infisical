import React from "react";
import { cva, type VariantProps } from "cva";

import { cn } from "../../utils";

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default:
          "border-foreground bg-foreground text-background [a&]:hover:bg-foreground/90 [a&]:hover:border-foreground/90 [button&]:hover:bg-foreground/90 [button&]:hover:border-foreground/90",
        accent:
          "border-accent/10 bg-accent/30 text-accent [a&]:hover:bg-accent/40 [a&]:hover:border-accent/20 [button&]:hover:bg-accent/40 [button&]:hover:border-accent/20",
        outline:
          "text-foreground border-foreground/40 [a&]:hover:border-foreground [a&]:hover:bg-foreground/20",
        "secret-manager":
          "border-secret-manager/75 bg-secret-manager/30 text-foreground [a&]:hover:bg-secret-manager/40 [a&]:hover:border-secret-manager [button&]:hover:bg-secret-manager/40 [button&]:hover:border-secret-manager",
        "secret-scanning":
          "border-secret-scanning/75 bg-secret-scanning/30 text-foreground [a&]:hover:bg-secret-scanning/40 [a&]:hover:border-secret-scanning [button&]:hover:bg-secret-scanning/40 [button&]:hover:border-secret-scanning",
        "cert-manager":
          "border-cert-manager/75 bg-cert-manager/30 text-foreground [a&]:hover:bg-cert-manager/40 [a&]:hover:border-cert-manager [button&]:hover:bg-cert-manager/40 [button&]:hover:border-cert-manager",
        ssh: "border-ssh/75 bg-ssh/30 text-foreground [a&]:hover:bg-ssh/40 [a&]:hover:border-ssh [button&]:hover:bg-ssh/40 [button&]:hover:border-ssh",
        pam: "border-pam/75 bg-pam/30 text-foreground [a&]:hover:bg-pam/40 [a&]:hover:border-pam [button&]:hover:bg-pam/40 [button&]:hover:border-pam",
        kms: "border-kms/75 bg-kms/30 text-foreground [a&]:hover:bg-kms/40 [a&]:hover:border-kms [button&]:hover:bg-kms/40 [button&]:hover:border-kms",
        org: "border-org/75 bg-org/30 text-foreground [a&]:hover:bg-org/40 [a&]:hover:border-org [button&]:hover:bg-org/40 [button&]:hover:border-org",
        namespace:
          "border-namespace/75 bg-namespace/30 text-foreground [a&]:hover:bg-namespace/40 [a&]:hover:border-namespace [button&]:hover:bg-namespace/40 [button&]:hover:border-namespace",
        success:
          "border-success/75 bg-success/30 text-foreground [a&]:hover:bg-success/40 [a&]:hover:border-success [button&]:hover:bg-success/40 [button&]:hover:border-success",
        info: "border-info/75 bg-info/30 text-foreground [a&]:hover:bg-info/40 [a&]:hover:border-info [button&]:hover:bg-info/40 [button&]:hover:border-info",
        warning:
          "border-warning/75 bg-warning/30 text-foreground [a&]:hover:bg-warning/40 [a&]:hover:border-warning [button&]:hover:bg-warning/40 [button&]:hover:border-warning",
        danger:
          "border-danger/75 bg-danger/30 text-foreground [a&]:hover:bg-danger/40 [a&]:hover:border-danger [button&]:hover:bg-danger/40 [button&]:hover:border-danger"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

const Alert: React.FC<React.ComponentProps<"div"> & VariantProps<typeof alertVariants>> = ({
  className,
  variant,
  ...props
}) => (
  <div
    data-slot="alert"
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
);

const AlertTitle: React.FC<React.ComponentProps<"div">> = ({ className, ...props }) => (
  <div
    data-slot="alert-title"
    className={cn("text-ca col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight", className)}
    {...props}
  />
);

const AlertDescription: React.FC<React.ComponentProps<"div">> = ({ className, ...props }) => (
  <div
    data-slot="alert-description"
    className={cn(
      "col-start-2 grid justify-items-start gap-1 text-sm opacity-75 [&_p]:leading-relaxed",
      className
    )}
    {...props}
  />
);

export { Alert, AlertDescription, AlertTitle };
