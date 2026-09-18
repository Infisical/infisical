import * as React from "react";
import { cva, type VariantProps } from "cva";

import { cn } from "../../utils";

const alertVariants = cva(
  // min-h-9 replaces a flex item's automatic minimum size, so without shrink-0 a multi-line alert
  // in a height-constrained flex column collapses to 36px and its text paints over the next sibling.
  "@container/alert relative grid min-h-9 w-full shrink-0 grid-cols-[0_1fr] items-center gap-y-1 rounded-md border px-3 py-2.5 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default:
          "border-border bg-container text-foreground [&_[data-slot=alert-description]]:text-foreground/80",
        info: "border-info/20 bg-info/5 text-info [&_[data-slot=alert-description]]:text-info/80",
        success:
          "border-success/20 bg-success/5 text-success [&_[data-slot=alert-description]]:text-success/80",
        warning:
          "border-warning/20 bg-warning/5 text-warning [&_[data-slot=alert-description]]:text-warning/80",
        danger:
          "border-danger/20 bg-danger/5 text-danger [&_[data-slot=alert-description]]:text-danger/80",
        project:
          "border-project/20 bg-project/5 text-project [&_[data-slot=alert-description]]:text-project/80",
        org: "border-org/20 bg-org/5 text-org [&_[data-slot=alert-description]]:text-org/80",
        "sub-org":
          "border-sub-org/20 bg-sub-org/5 text-sub-org [&_[data-slot=alert-description]]:text-sub-org/80"
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
      className={cn("col-start-2 line-clamp-1 min-h-4 text-sm font-medium", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-sm has-[>[data-slot=alert-action]]:flex has-[>[data-slot=alert-action]]:flex-col has-[>[data-slot=alert-action]]:gap-3 has-[>[data-slot=alert-action]]:@sm/alert:flex-row has-[>[data-slot=alert-action]]:@sm/alert:items-center has-[>[data-slot=alert-action]]:@sm/alert:justify-between",
        className
      )}
      {...props}
    />
  );
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-action" className={cn("shrink-0", className)} {...props} />;
}

export { Alert, AlertAction, AlertDescription, AlertTitle };
