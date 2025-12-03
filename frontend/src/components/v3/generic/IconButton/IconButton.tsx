import * as React from "react";
import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "cva";
import { twMerge } from "tailwind-merge";

import { Lottie } from "@app/components/v2";
import { cn } from "@app/components/v3/utils";

const iconButtonVariants = cva(
  cn(
    "inline-flex items-center active:scale-[0.99] justify-center border cursor-pointer whitespace-nowrap rounded-[4px] text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-75 [&_svg]:pointer-events-none shrink-0 [&>svg]:shrink-0",
    "focus-visible:ring-ring outline-0 focus-visible:ring-2"
  ),
  {
    variants: {
      variant: {
        default:
          "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:border-foreground/90",
        accent:
          "border-accent/10 bg-accent/40 text-foreground hover:bg-accent/50 hover:border-accent/20",
        outline: "text-foreground hover:bg-foreground/20 border-border hover:border-foreground/50",
        ghost: "text-foreground hover:bg-foreground/40 border-transparent",
        project:
          "border-project/75 bg-project/40 text-foreground hover:bg-project/50 hover:border-kms",
        org: "border-org/75 bg-org/40 text-foreground hover:bg-org/50 hover:border-org",
        "sub-org":
          "border-sub-org/75 bg-sub-org/40 text-foreground hover:bg-sub-org/50 hover:border-namespace",
        success:
          "border-success/75 bg-success/40 text-foreground hover:bg-success/50 hover:border-success",
        info: "border-info/75 bg-info/40 text-foreground hover:bg-info/50 hover:border-info",
        warning:
          "border-warning/75 bg-warning/40 text-foreground hover:bg-warning/50 hover:border-warning",
        danger:
          "border-danger/75 bg-danger/40 text-foreground hover:bg-danger/50 hover:border-danger"
      },
      size: {
        xs: "h-6 w-6 [&>svg]:size-4 rounded-[5px] [&>svg]:stroke-[1.75]",
        sm: "h-8 w-8 [&>svg]:size-5 [&>svg]:stroke-[1.5]",
        md: "h-9 w-9 [&>svg]:size-6 [&>svg]:stroke-[1.5]",
        lg: "h-10 w-10 [&>svg]:size-7 [&>svg]:stroke-[1.5]"
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
      variant: "default",
      size: "md"
    }
  }
);

type UnstableIconButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof iconButtonVariants> & {
    asChild?: boolean;
    isPending?: boolean;
    isDisabled?: boolean;
  };

const UnstableIconButton = forwardRef<HTMLButtonElement, UnstableIconButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "md",
      asChild = false,
      isPending = false,
      disabled = false,
      isDisabled = false,
      children,
      ...props
    },
    ref
  ): JSX.Element => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        data-slot="button"
        className={cn(iconButtonVariants({ variant, size, isPending }), className)}
        disabled={isPending || disabled || isDisabled}
        {...props}
      >
        {children}
        {isPending && (
          <Lottie
            icon={variant === "default" ? "infisical_loading_bw" : "infisical_loading_white"}
            isAutoPlay
            className={twMerge(
              "absolute rounded-xl",
              size === "xs" && "w-6",
              size === "sm" && "w-7",
              size === "md" && "w-8",
              size === "lg" && "w-9"
            )}
          />
        )}
      </Comp>
    );
  }
);

UnstableIconButton.displayName = "IconButton";

export { iconButtonVariants, UnstableIconButton, type UnstableIconButtonProps };
