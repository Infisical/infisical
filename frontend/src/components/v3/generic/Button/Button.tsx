import * as React from "react";
import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "cva";

import { cn } from "@app/components/v3/utils";

import { Loader } from "../Loader";

const buttonVariants = cva(
  cn(
    "relative inline-flex items-center overflow-visible rounded-md active:scale-[0.99] justify-center border cursor-pointer whitespace-nowrap",
    " text-sm transition-all disabled:pointer-events-none disabled:opacity-50 shrink-0",
    "[&>svg]:pointer-events-none  [&>svg]:shrink-0",
    "focus-visible:ring-ring outline-0 focus-visible:ring-2 select-none",
    "has-[[data-slot=button-badge]]:my-1.5 has-[[data-slot=button-badge]]:outline-1 has-[[data-slot=button-badge]]:outline-offset-4 has-[[data-slot=button-badge]]:outline-accent/60 has-[[data-slot=button-badge]]:outline-solid"
  ),
  {
    variants: {
      variant: {
        outline:
          "text-foreground hover:bg-foreground/10 border-border hover:border-foreground/20 data-[state=open]:bg-foreground/10 data-[state=open]:border-foreground/20 [--control-variant-color:var(--color-foreground)] [--control-variant-border-color:var(--color-border)] hover:[--control-variant-border-color:color-mix(in_oklab,var(--color-foreground)_20%,transparent)] data-[state=open]:[--control-variant-border-color:color-mix(in_oklab,var(--color-foreground)_20%,transparent)]",
        ghost:
          "text-foreground hover:bg-foreground/10 border-transparent data-[state=open]:bg-foreground/10 [--control-variant-color:var(--color-foreground)] [--control-variant-border-color:transparent]",
        link: "h-auto! rounded-none border-transparent bg-transparent p-0! text-foreground hover:bg-transparent hover:underline data-[state=open]:bg-transparent active:scale-100 [--control-variant-color:var(--color-foreground)] [--control-variant-border-color:transparent]",
        neutral:
          "border-neutral/25 bg-neutral/10 text-foreground hover:bg-neutral/15 hover:border-neutral/30 data-[state=open]:bg-neutral/15 data-[state=open]:border-neutral/30 [--control-variant-color:var(--color-neutral)] [--control-variant-border-color:color-mix(in_oklab,var(--color-neutral)_25%,transparent)] hover:[--control-variant-border-color:color-mix(in_oklab,var(--color-neutral)_30%,transparent)] data-[state=open]:[--control-variant-border-color:color-mix(in_oklab,var(--color-neutral)_30%,transparent)]",
        project:
          "border-project/25 bg-project/10 text-foreground hover:bg-project/15 hover:border-project/30 data-[state=open]:bg-project/15 data-[state=open]:border-project/30 [--control-variant-color:var(--color-project)] [--control-variant-border-color:color-mix(in_oklab,var(--color-project)_25%,transparent)] hover:[--control-variant-border-color:color-mix(in_oklab,var(--color-project)_30%,transparent)] data-[state=open]:[--control-variant-border-color:color-mix(in_oklab,var(--color-project)_30%,transparent)]",
        org: "border-org/25 bg-org/10 text-foreground hover:bg-org/15 hover:border-org/30 data-[state=open]:bg-org/15 data-[state=open]:border-org/30 [--control-variant-color:var(--color-org)] [--control-variant-border-color:color-mix(in_oklab,var(--color-org)_25%,transparent)] hover:[--control-variant-border-color:color-mix(in_oklab,var(--color-org)_30%,transparent)] data-[state=open]:[--control-variant-border-color:color-mix(in_oklab,var(--color-org)_30%,transparent)]",
        "sub-org":
          "border-sub-org/25 bg-sub-org/10 text-foreground hover:bg-sub-org/15 hover:border-sub-org/30 data-[state=open]:bg-sub-org/15 data-[state=open]:border-sub-org/30 [--control-variant-color:var(--color-sub-org)] [--control-variant-border-color:color-mix(in_oklab,var(--color-sub-org)_25%,transparent)] hover:[--control-variant-border-color:color-mix(in_oklab,var(--color-sub-org)_30%,transparent)] data-[state=open]:[--control-variant-border-color:color-mix(in_oklab,var(--color-sub-org)_30%,transparent)]",
        success:
          "border-success/25 bg-success/10 text-foreground hover:bg-success/15 hover:border-success/30 data-[state=open]:bg-success/15 data-[state=open]:border-success/30 [--control-variant-color:var(--color-success)] [--control-variant-border-color:color-mix(in_oklab,var(--color-success)_25%,transparent)] hover:[--control-variant-border-color:color-mix(in_oklab,var(--color-success)_30%,transparent)] data-[state=open]:[--control-variant-border-color:color-mix(in_oklab,var(--color-success)_30%,transparent)]",
        info: "border-info/25 bg-info/10 text-foreground hover:bg-info/15 hover:border-info/30 data-[state=open]:bg-info/15 data-[state=open]:border-info/30 [--control-variant-color:var(--color-info)] [--control-variant-border-color:color-mix(in_oklab,var(--color-info)_25%,transparent)] hover:[--control-variant-border-color:color-mix(in_oklab,var(--color-info)_30%,transparent)] data-[state=open]:[--control-variant-border-color:color-mix(in_oklab,var(--color-info)_30%,transparent)]",
        warning:
          "border-warning/25 bg-warning/10 text-foreground hover:bg-warning/15 hover:border-warning/30 data-[state=open]:bg-warning/15 data-[state=open]:border-warning/30 [--control-variant-color:var(--color-warning)] [--control-variant-border-color:color-mix(in_oklab,var(--color-warning)_25%,transparent)] hover:[--control-variant-border-color:color-mix(in_oklab,var(--color-warning)_30%,transparent)] data-[state=open]:[--control-variant-border-color:color-mix(in_oklab,var(--color-warning)_30%,transparent)]",
        danger:
          "border-danger/25 bg-danger/10 text-foreground hover:bg-danger/15 hover:border-danger/30 data-[state=open]:bg-danger/15 data-[state=open]:border-danger/30 [--control-variant-color:var(--color-danger)] [--control-variant-border-color:color-mix(in_oklab,var(--color-danger)_25%,transparent)] hover:[--control-variant-border-color:color-mix(in_oklab,var(--color-danger)_30%,transparent)] data-[state=open]:[--control-variant-border-color:color-mix(in_oklab,var(--color-danger)_30%,transparent)]",
        pam: "border-product-pam/30 bg-product-pam/25 text-foreground hover:bg-product-pam/30 hover:border-product-pam/35 data-[state=open]:bg-product-pam/30 data-[state=open]:border-product-pam/35 [--control-variant-color:var(--color-product-pam)] [--control-variant-border-color:color-mix(in_oklab,var(--color-product-pam)_30%,transparent)] hover:[--control-variant-border-color:color-mix(in_oklab,var(--color-product-pam)_35%,transparent)] data-[state=open]:[--control-variant-border-color:color-mix(in_oklab,var(--color-product-pam)_35%,transparent)]",
        // Tinted from --product-color, which the caller must set inline (e.g. a billing catalog
        // product's color) since the palette isn't knowable at build time.
        product:
          "border-(--product-color)/30 bg-(--product-color)/25 text-foreground hover:bg-(--product-color)/30 hover:border-(--product-color)/35 data-[state=open]:bg-(--product-color)/30 data-[state=open]:border-(--product-color)/35 [--control-variant-color:var(--product-color)] [--control-variant-border-color:color-mix(in_oklab,var(--product-color)_30%,transparent)] hover:[--control-variant-border-color:color-mix(in_oklab,var(--product-color)_35%,transparent)] data-[state=open]:[--control-variant-border-color:color-mix(in_oklab,var(--product-color)_35%,transparent)]"
      },
      size: {
        xs: "h-7 gap-2 rounded-sm px-2 text-xs [&>svg]:size-3",
        sm: "h-8 gap-2 px-2.5 text-sm [&>svg]:size-3",
        md: "h-9 gap-2 px-3 text-sm [&>svg]:size-3.5",
        lg: "h-10 gap-2 px-3 text-sm [&>svg]:size-4"
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
      variant: "outline",
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
      variant = "outline",
      size = "md",
      isPending = false,
      isFullWidth = false,
      isDisabled = false,
      children: _children,
      asChild = false,
      type = "button",
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
        {isPending && <Loader aria-hidden size="sm" className="absolute rounded-xl" />}
      </>
    );

    return (
      <Comp
        ref={ref}
        data-slot="button"
        data-variant={variant}
        data-size={size}
        type={type}
        aria-busy={isPending || undefined}
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
