import * as React from "react";
import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "cva";
import { twMerge } from "tailwind-merge";

import { Lottie } from "@app/components/v2/Lottie";
import { cn } from "@app/components/v3/utils";

const iconButtonVariants = cva(
  cn(
    "inline-flex items-center active:scale-[0.99] justify-center border cursor-pointer whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none shrink-0 [&>svg]:shrink-0",
    "focus-visible:ring-ring outline-0 focus-visible:ring-2"
  ),
  {
    variants: {
      variant: {
        default:
          "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:border-foreground/90 data-[state=open]:bg-foreground/90 data-[state=open]:border-foreground/90",
        outline:
          "text-foreground hover:bg-foreground/10 border-border hover:border-foreground/20 data-[state=open]:bg-foreground/10 data-[state=open]:border-foreground/20",
        ghost:
          "text-foreground hover:bg-foreground/10 border-transparent data-[state=open]:bg-foreground/10",
        "ghost-muted":
          "text-muted hover:text-foreground hover:bg-foreground/10 border-transparent data-[state=open]:text-foreground data-[state=open]:bg-foreground/10",
        project:
          "border-project/25 bg-project/10 text-foreground hover:bg-project/15 hover:border-project/30 data-[state=open]:bg-project/15 data-[state=open]:border-project/30",
        org: "border-org/25 bg-org/10 text-foreground hover:bg-org/15 hover:border-org/30 data-[state=open]:bg-org/15 data-[state=open]:border-org/30",
        "sub-org":
          "border-sub-org/25 bg-sub-org/10 text-foreground hover:bg-sub-org/15 hover:border-sub-org/30 data-[state=open]:bg-sub-org/15 data-[state=open]:border-sub-org/30",
        success:
          "border-success/25 bg-success/10 text-foreground hover:bg-success/15 hover:border-success/30 data-[state=open]:bg-success/15 data-[state=open]:border-success/30",
        info: "border-info/25 bg-info/10 text-foreground hover:bg-info/15 hover:border-info/30 data-[state=open]:bg-info/15 data-[state=open]:border-info/30",
        warning:
          "border-warning/25 bg-warning/10 text-foreground hover:bg-warning/15 hover:border-warning/30 data-[state=open]:bg-warning/15 data-[state=open]:border-warning/30",
        danger:
          "border-danger/25 bg-danger/10 text-foreground hover:bg-danger/15 hover:border-danger/30 data-[state=open]:bg-danger/15 data-[state=open]:border-danger/30"
      },
      size: {
        xs: "h-7 w-7 [&>svg]:size-4 rounded-sm [&>svg]:stroke-[1.75]",
        sm: "h-8 w-8 [&>svg]:size-4 [&>svg]:stroke-[1.5]",
        md: "h-9 w-9 [&>svg]:size-4 [&>svg]:stroke-[1.5]",
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

type IconButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof iconButtonVariants> & {
    asChild?: boolean;
    isPending?: boolean;
    isDisabled?: boolean;
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

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "md",
      asChild = false,
      isPending = false,
      disabled = false,
      isDisabled = false,
      type = "button",
      children,
      ...props
    },
    ref
  ): JSX.Element => {
    const Comp = asChild ? Slot : "button";

    const content = asChild ? (
      children
    ) : (
      <>
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
      </>
    );

    return (
      <Comp
        ref={ref}
        data-slot="button"
        type={type}
        className={cn(iconButtonVariants({ variant, size, isPending }), className)}
        disabled={isPending || disabled || isDisabled}
        {...props}
      >
        {content}
      </Comp>
    );
  }
);

IconButton.displayName = "IconButton";

export { IconButton, type IconButtonProps, iconButtonVariants };
