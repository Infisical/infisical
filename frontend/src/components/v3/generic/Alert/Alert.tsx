/* eslint-disable react/prop-types */

import * as React from "react";
import { cva, type VariantProps } from "cva";

import { cn } from "../../utils";

const alertVariants = cva(
  "relative w-full rounded-md px-3 py-1.5 min-h-9 text-sm items-center grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "bg-container text-foreground",
        outline: "border border-border bg-container text-foreground",
        info: "bg-info/5 text-info",
        success: "bg-success/5 text-success",
        warning: "bg-warning/5 text-warning",
        danger: "bg-danger/5 text-danger",
        project: "bg-project/5 text-project",
        org: "bg-org/5 text-org",
        "sub-org": "bg-sub-org/5 text-sub-org"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("col-start-2 line-clamp-1 min-h-4 tracking-tight", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("col-start-2 grid justify-items-start gap-1 [&_p]:leading-relaxed", className)}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle };
