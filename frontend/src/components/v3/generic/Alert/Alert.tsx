/* eslint-disable react/prop-types */

import * as React from "react";
import { cva, type VariantProps } from "cva";

import { cn } from "../../utils";

const alertVariants = cva(
  "relative grid min-h-9 w-full grid-cols-[0_1fr] items-center gap-y-0.5 rounded-md border px-3 py-1.5 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "border-border bg-container text-foreground",
        info: "border-info/20 bg-info/5 text-info",
        success: "border-success/20 bg-success/5 text-success",
        warning: "border-warning/20 bg-warning/5 text-warning",
        danger: "border-danger/20 bg-danger/5 text-danger",
        project: "border-project/20 bg-project/5 text-project",
        org: "border-org/20 bg-org/5 text-org",
        "sub-org": "border-sub-org/20 bg-sub-org/5 text-sub-org"
      },
      appearance: {
        default: "",
        borderless: "border-0"
      }
    },
    defaultVariants: {
      variant: "default",
      appearance: "default"
    }
  }
);

function Alert({
  className,
  variant,
  appearance,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant, appearance }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 line-clamp-1 min-h-4 text-sm leading-4 font-medium tracking-tight",
        className
      )}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed",
        className
      )}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle };
