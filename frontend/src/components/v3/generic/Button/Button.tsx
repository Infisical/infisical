import * as React from "react";
import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "cva";

import { Lottie } from "@app/components/v2";
import { cn } from "@app/components/v3/utils";

const buttonVariants = cva(
  cn(
    "inline-flex items-center rounded-md active:scale-[0.95] justify-center border cursor-pointer whitespace-nowrap",
    " text-sm transition-all disabled:pointer-events-none disabled:opacity-75 shrink-0",
    "[&>svg]:pointer-events-none  [&>svg]:shrink-0",
    "focus-visible:ring-ring outline-0 focus-visible:ring-2 select-none"
  ),
  {
    variants: {
      variant: {
        outline: "text-foreground hover:bg-foreground/10 border-border hover:border-foreground/20",
        ghost: "text-foreground hover:bg-foreground/10 border-transparent",
        neutral:
          "border-neutral/25 bg-neutral/15 text-foreground hover:bg-neutral/30 hover:border-neutral/30",
        project:
          "border-project/25 bg-project/15 text-foreground hover:bg-project/30 hover:border-project/30",
        org: "border-org/25 bg-org/15 text-foreground hover:bg-org/30 hover:border-org/30",
        "sub-org":
          "border-sub-org/25 bg-sub-org/15 text-foreground hover:bg-sub-org/30 hover:border-sub-org/30",
        success:
          "border-success/25 bg-success/15 text-foreground hover:bg-success/30 hover:border-success/30",
        info: "border-info/25 bg-info/15 text-foreground hover:bg-info/30 hover:border-info/30",
        warning:
          "border-warning/25 bg-warning/15 text-foreground hover:bg-warning/30 hover:border-warning/30",
        danger:
          "border-danger/25 bg-danger/15 text-foreground hover:bg-danger/30 hover:border-danger/30"
      },
      size: {
        xs: "h-7 px-2 text-xs rounded-sm [&>svg]:size-3 gap-1.5",
        sm: "h-8 px-2.5 text-sm [&>svg]:size-3 gap-1.5",
        md: "h-9 px-3 text-sm [&>svg]:size-3.5 gap-1.5",
        lg: "h-10 px-3 text-sm [&>svg]:size-3.5 gap-1.5"
      },
      isPending: {
        true: "text-transparent"
      },
      isFullWidth: {
        true: "w-full",
        false: "w-fit"
      }
    },
    defaultVariants: {
      variant: "neutral",
      size: "md"
    }
  }
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    isPending?: boolean;
    isFullWidth?: boolean;
    isDisabled?: boolean;
    asChild?: boolean;
  } & (
    | {
        asChild: true;
        isPending?: never;
      }
    | {
        asChild?: false;
        isPending?: boolean;
      }
  );

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "neutral",
      size = "md",
      isPending = false,
      isFullWidth = false,
      isDisabled = false,
      children: _children,
      asChild = false,
      ...props
    },
    ref
  ): JSX.Element => {
    const Comp = asChild ? Slot : "button";

    const children = asChild ? (
      _children
    ) : (
      <>
        {_children}
        {isPending && (
          <Lottie icon="infisical_loading_white" isAutoPlay className="absolute w-8 rounded-xl" />
        )}
      </>
    );

    return (
      <Comp
        ref={ref}
        data-slot="button"
        data-variant={variant}
        data-size={size}
        disabled={isDisabled || isPending}
        className={cn(buttonVariants({ variant, size, className, isPending, isFullWidth }))}
        {...props}
      >
        {children}
      </Comp>
    );
  }
);

Button.displayName = "Button";

export { Button, type ButtonProps, buttonVariants };
