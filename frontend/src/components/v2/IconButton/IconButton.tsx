import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";
import { cva, VariantProps } from "cva";
import { twMerge } from "tailwind-merge";

type Props = {
  children: ReactNode;
  // This is kept as required because by accessibility convention and eslint
  // when button doesn't have text an aria-label needs to be passed
  ariaLabel: string;
  isDisabled?: boolean;
};

const iconButtonVariants = cva(
  [
    "button",
    "transition-all",
    "font-inter font-medium user-select-none",
    "cursor-pointer",
    "inline-flex items-center justify-center",
    "relative"
  ],
  {
    variants: {
      colorSchema: {
        primary: ["bg-project", "text-black", "border-project hover:opacity-80"],
        secondary: ["bg-foreground/10", "text-label", "border-border hover:bg-muted"],
        danger: ["bg-[#973939]", "text-white", "border-danger"]
      },
      variant: {
        solid: "",
        outline: ["bg-transparent", "border-2", "border-solid"],
        plain: "",
        star: "text-foreground bg-foreground/10",
        outline_bg: ""
      },
      isDisabled: {
        true: "bg-opacity-70 cursor-not-allowed",
        false: ""
      },
      isRounded: {
        true: "rounded-md",
        false: ""
      },
      size: {
        xs: ["text-xs", "rounded-xs", "py-1.5", "px-2"],
        sm: ["text-sm", "py-3", "px-3"],
        md: ["text-md", "py-4", "px-4"],
        lg: ["text-lg", "py-6", "px-6"]
      }
    },
    compoundVariants: [
      {
        colorSchema: "primary",
        variant: "star",
        className: "hover:bg-project hover:text-black"
      },
      {
        colorSchema: "primary",
        variant: "outline_bg",
        className:
          "bg-container-hover border border-border hover:bg-project/15 hover:border-project/60 text-foreground hover:text-foreground duration-100"
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
        className: "hover:bg-foreground/10"
      },
      {
        colorSchema: "danger",
        variant: "outline",
        className: "text-danger hover:bg-danger hover:text-black"
      },
      {
        colorSchema: "primary",
        variant: "plain",
        className: "hover:text-project"
      },
      {
        colorSchema: "secondary",
        variant: "plain",
        className: "text-muted"
      },
      {
        colorSchema: "danger",
        variant: "plain",
        className: "hover:text-danger"
      },
      {
        colorSchema: ["danger", "primary", "secondary"],
        variant: ["plain"],
        className: "bg-transparent py-1 px-1 text-label"
      }
    ]
  }
);

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> &
  VariantProps<typeof iconButtonVariants> &
  Props;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      children,
      ariaLabel,
      isDisabled = false,
      className,
      size = "sm",
      variant = "solid",
      isRounded = true,
      colorSchema = "primary",
      ...props
    },
    ref
  ): JSX.Element => (
    <button
      ref={ref}
      aria-disabled={isDisabled}
      type="button"
      aria-label={ariaLabel}
      className={twMerge(
        iconButtonVariants({
          className,
          colorSchema,
          size,
          variant,
          isRounded,
          isDisabled
        })
      )}
      disabled={isDisabled}
      {...props}
    >
      {children}
    </button>
  )
);

IconButton.displayName = "IconButton";
