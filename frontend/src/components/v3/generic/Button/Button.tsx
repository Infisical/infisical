import * as React from "react";
import { forwardRef } from "react";
import { Link, LinkProps } from "@tanstack/react-router";
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
        default:
          "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:border-foreground/90",
        neutral:
          "border-neutral/10 bg-neutral/40 text-foreground hover:bg-neutral/50 hover:border-neutral/20",
        outline: "text-foreground hover:bg-foreground/10 border-border hover:border-foreground/20",
        ghost: "text-foreground hover:bg-foreground/10 border-transparent",
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
      variant: "default",
      size: "md"
    }
  }
);

type UnstableButtonProps = (VariantProps<typeof buttonVariants> & {
  isPending?: boolean;
  isFullWidth?: boolean;
  isDisabled?: boolean;
}) &
  (
    | ({ as?: "button" | undefined } & React.ComponentProps<"button">)
    | ({ as: "link"; className?: string } & LinkProps)
    | ({ as: "a" } & React.ComponentProps<"a">)
  );

const UnstableButton = forwardRef<HTMLButtonElement | HTMLAnchorElement, UnstableButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "md",
      isPending = false,
      isFullWidth = false,
      isDisabled = false,
      children,
      ...props
    },
    ref
  ): JSX.Element => {
    const sharedProps = {
      "data-slot": "button",
      className: cn(buttonVariants({ variant, size, isPending, isFullWidth }), className)
    };

    const child = (
      <>
        {children}
        {isPending && (
          <Lottie
            icon={variant === "default" ? "infisical_loading_bw" : "infisical_loading_white"}
            isAutoPlay
            className="absolute w-8 rounded-xl"
          />
        )}
      </>
    );

    switch (props.as) {
      case "a":
        return (
          <a
            ref={ref as React.Ref<HTMLAnchorElement>}
            target="_blank"
            rel="noopener noreferrer"
            {...props}
            {...sharedProps}
          >
            {child}
          </a>
        );
      case "link":
        return (
          <Link ref={ref as React.Ref<HTMLAnchorElement>} {...props} {...sharedProps}>
            {child}
          </Link>
        );
      default:
        return (
          <button
            ref={ref as React.Ref<HTMLButtonElement>}
            type="button"
            disabled={isPending || isDisabled}
            {...props}
            {...sharedProps}
          >
            {child}
          </button>
        );
    }
  }
);

UnstableButton.displayName = "Button";

export { buttonVariants, UnstableButton, type UnstableButtonProps };
