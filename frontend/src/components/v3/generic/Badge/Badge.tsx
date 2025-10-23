import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "cva";

import { cn } from "@app/components/v3/utils";

const badgeVariants = cva(
  [
    "select-none items-center rounded-sm px-1.5 py-0.5 text-xs",
    "gap-x-1 [a&,button&]:cursor-pointer inline-flex",
    "[&>svg]:pointer-events-none [&>svg]:shrink-0 [&>svg]:stroke-[2.25] [&>svg]:size-3",
    "transition duration-200 ease-in-out"
  ],
  {
    variants: {
      isTruncatable: {
        true: "[&>span,&>p]:truncate min-w-0",
        false: "w-fit shrink-0 whitespace-nowrap overflow-hidden"
      },
      variant: {
        neutral: "bg-neutral/30 text-neutral [a&,button&]:hover:bg-neutral/40",
        success: "bg-success/30 text-success [a&,button&]:hover:bg-success/40",
        info: "bg-info/30 text-info [a&,button&]:hover:bg-info/40",
        warning: "bg-warning/30 text-warning [a&,button&]:hover:bg-warning/40",
        danger: "bg-danger/30 text-danger [a&,button&]:hover:bg-danger/40",
        project: "bg-project/30 text-project [a&,button&]:hover:bg-project/40",
        org: "bg-org/30 text-org [a&,button&]:hover:bg-org/40",
        "sub-org": "bg-sub-org/30 text-sub-org [a&,button&]:hover:bg-sub-org/40"
      }
    },
    defaultVariants: {
      variant: "success"
    }
  }
);

type TBadgeProps = VariantProps<typeof badgeVariants> &
  React.ComponentProps<"span"> & {
    asChild?: boolean;
  };

const Badge = forwardRef<HTMLSpanElement, TBadgeProps>(
  ({ className, variant, asChild = false, isTruncatable = false, ...props }, ref): JSX.Element => {
    const Comp = asChild ? Slot : "span";
    return (
      <Comp
        ref={ref}
        data-slot="badge"
        className={cn(badgeVariants({ variant, isTruncatable }), className)}
        {...props}
      />
    );
  }
);

Badge.displayName = "Badge";

export { Badge, badgeVariants, type TBadgeProps };
