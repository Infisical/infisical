import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";
import { cva, VariantProps } from "cva";
import { twMerge } from "tailwind-merge";

import { Loader } from "../../v3/generic/Loader";

type Props = {
  children: ReactNode;
  isDisabled?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  // loading state
  isLoading?: boolean;
};

// refactor(akhilmhdh): both color and size variants are together need to split it
// colorSchema should handle all color class names
// variant should handle how the button padding and other  types should be set
const buttonVariants = cva(
  [
    "button",
    "transition-all",
    "font-inter font-medium",
    "cursor-pointer",
    "inline-flex items-center justify-center",
    "relative",
    "whitespace-nowrap"
  ],
  {
    variants: {
      colorSchema: {
        primary: ["bg-project", "text-black", "border-project bg-opacity-90 hover:bg-opacity-100"],
        secondary: ["bg-foreground/10", "text-label", "border-border hover:bg-opacity-80"],
        danger: ["bg-danger!", "text-white!", "border-danger! hover:!bg-opacity-90"],
        gray: ["bg-container", "text-foreground"]
      },
      variant: {
        solid: "",
        outline: ["bg-transparent", "border-2", "border-solid"],
        plain: "",
        selected: "",
        outline_bg: "",
        // a constant color not in use on hover or click goes colorSchema color
        star: "text-foreground bg-container-hover border-border",
        link: "text-project p-0! bg-transparent outline-hidden border-none"
      },
      isDisabled: {
        true: "bg-container-hover border border-border text-foreground opacity-50 cursor-not-allowed",
        false: "border"
      },
      isFullWidth: {
        true: "w-full",
        false: ""
      },
      isRounded: {
        true: "rounded-md",
        false: ""
      },
      size: {
        xs: ["text-xs", "py-1", "px-2"],
        sm: ["text-sm", "py-2", "px-4"],
        md: ["text-md", "py-2", "px-5"],
        lg: ["text-lg", "py-2", "px-6"]
      }
    },
    compoundVariants: [
      {
        colorSchema: "primary",
        variant: "star",
        className:
          "bg-container-hover border border-border hover:bg-project hover:text-black hover:border-project duration-100"
      },
      {
        colorSchema: "primary",
        variant: "solid",
        className: "text-black bg-project bg-opacity-90 hover:bg-project hover:text-black"
      },
      {
        colorSchema: "primary",
        variant: "selected",
        className: "bg-project/10 border border-project/50 text-foreground"
      },
      {
        colorSchema: "primary",
        variant: "outline_bg",
        className:
          "bg-foreground/10 border border-border hover:bg-project/10 hover:border-project/40 text-foreground"
      },
      {
        colorSchema: "secondary",
        variant: "star",
        className:
          "bg-container-hover border border-border hover:bg-foreground/10 hover:text-foreground"
      },
      {
        colorSchema: "danger",
        variant: "star",
        className: "hover:bg-danger hover:text-white"
      },
      {
        colorSchema: "primary",
        variant: "outline",
        className: "text-project hover:bg-project hover:text-black"
      },
      {
        colorSchema: "secondary",
        variant: "outline",
        className: "border-border hover:border-foreground/20"
      },
      {
        colorSchema: "danger",
        variant: "outline",
        className: "text-danger hover:bg-danger hover:text-black"
      },
      {
        colorSchema: "danger",
        variant: "outline_bg",
        className:
          "bg-foreground/10 border border-danger/40 hover:bg-danger/15 bg-danger/10 hover:border-danger text-danger"
      },
      {
        colorSchema: "primary",
        variant: "plain",
        className: "text-project"
      },
      {
        colorSchema: "gray",
        variant: "plain",
        className: "bg-transparent text-foreground"
      },
      {
        colorSchema: "secondary",
        variant: "plain",
        className: "text-label hover:text-foreground border-none"
      },
      {
        colorSchema: "danger",
        variant: "plain",
        className: "text-danger"
      },
      {
        colorSchema: ["danger", "primary", "secondary"],
        variant: ["plain"],
        className: "bg-transparent py-1 px-1"
      }
    ]
  }
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> &
  Props;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      isDisabled = false,
      className = "",
      size = "sm",
      variant = "solid",
      isFullWidth,
      isRounded = true,
      leftIcon,
      rightIcon,
      isLoading,
      colorSchema = "primary",
      ...props
    },
    ref
  ): JSX.Element => {
    const loadingToggleClass = isLoading ? "opacity-0" : "opacity-100";

    return (
      <button
        ref={ref}
        aria-disabled={isDisabled}
        type="button"
        className={twMerge(
          buttonVariants({
            colorSchema,
            size,
            variant,
            isRounded,
            isDisabled,
            isFullWidth,
            className
          })
        )}
        disabled={isDisabled}
        aria-busy={isLoading || undefined}
        {...props}
      >
        {isLoading && (
          <Loader
            aria-hidden
            variant={variant === "solid" && colorSchema === "primary" ? "inverse" : "brand"}
            size="sm"
            className="absolute rounded-xl opacity-80 shadow-xs"
          />
        )}
        {leftIcon && (
          <div
            className={twMerge(
              "pointer-events-none inline-flex shrink-0 items-center justify-center transition-all",
              loadingToggleClass,
              size === "xs" ? "mr-1" : "mr-2"
            )}
          >
            {leftIcon}
          </div>
        )}
        <span
          className={twMerge(
            "transition-all",
            isFullWidth ? "w-full" : "w-min",
            loadingToggleClass
          )}
        >
          {children}
        </span>
        {rightIcon && (
          <div
            className={twMerge(
              "inline-flex shrink-0 cursor-pointer items-center justify-center transition-all",
              loadingToggleClass
            )}
          >
            {rightIcon}
          </div>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
