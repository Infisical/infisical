import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "cva";

import { cn } from "@app/components/v3/utils";

const badgeVariants = cva(
  [
    "select-none border items-center align-middle rounded-sm h-4.5 px-1.5 text-xs",
    "gap-x-1 [a&,button&]:cursor-pointer inline-flex font-normal",
    "[&>svg]:pointer-events-none [&>svg]:shrink-0 [&>svg]:stroke-[2.25] [&_svg:not([class*='size-'])]:size-3",
    "transition duration-200 ease-in-out"
  ],
  {
    variants: {
      isTruncatable: {
        true: "[&>span,&>p]:truncate min-w-0",
        false: "w-fit shrink-0 min-w-fit whitespace-nowrap overflow-hidden"
      },
      isFullWidth: {
        true: "w-full justify-center"
      },
      isSquare: {
        true: "w-4.5 justify-center px-0.5"
      },
      variant: {
        ghost: "text-foreground border-none",
        default: "bg-label text-background border-label [a&,button&]:hover:bg-primary/35",
        outline: "text-label border-label border",
        neutral: "bg-neutral/15 border-neutral/10 text-neutral [a&,button&]:hover:bg-neutral/35",
        success: "bg-success/15 border-success/10 text-success [a&,button&]:hover:bg-success/35",
        info: "bg-info/15 border-info/10 border text-info [a&,button&]:hover:bg-info/35",
        warning: "bg-warning/15 border-warning/10 text-warning [a&,button&]:hover:bg-warning/35",
        danger: "bg-danger/15 border-danger/10 text-danger border [a&,button&]:hover:bg-danger/35",
        project:
          "bg-project/15 text-project border-project/10 border [a&,button&]:hover:bg-project/35",
        org: "bg-org/15 border  border-org/10 text-org [a&,button&]:hover:bg-org/35",
        "sub-org": "bg-sub-org/15 border-sub-org/10 text-sub-org [a&,button&]:hover:bg-sub-org/35"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

type TBadgeProps = VariantProps<typeof badgeVariants> &
  React.ComponentProps<"span"> & {
    asChild?: boolean;
  };

const Badge = forwardRef<HTMLSpanElement, TBadgeProps>(
  (
    {
      className,
      variant,
      asChild = false,
      isTruncatable = false,
      isFullWidth = false,
      isSquare = false,
      ...props
    },
    ref
  ): JSX.Element => {
    const Comp = asChild ? Slot : "span";
    return (
      <Comp
        ref={ref}
        data-slot="badge"
        className={cn(badgeVariants({ variant, isTruncatable, isFullWidth, isSquare }), className)}
        {...props}
      />
    );
  }
);

Badge.displayName = "Badge";

export { Badge, badgeVariants, type TBadgeProps };
