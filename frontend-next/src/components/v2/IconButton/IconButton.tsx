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
        primary: ["bg-primary", "text-black", "border-primary hover:opacity-80"],
        secondary: ["bg-mineshaft", "text-gray-300", "border-mineshaft hover:bg-bunker-400"],
        danger: ["bg-[#973939]", "text-white", "border-red"]
      },
      variant: {
        solid: "",
        outline: ["bg-transparent", "border-2", "border-solid"],
        plain: "",
        star: "text-bunker-200 bg-mineshaft-500",
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
        xs: ["text-xs", "rounded-sm", "py-1.5", "px-2"],
        sm: ["text-sm", "py-3", "px-3"],
        md: ["text-md", "py-4", "px-4"],
        lg: ["text-lg", "py-6", "px-6"]
      }
    },
    compoundVariants: [
      {
        colorSchema: "primary",
        variant: "star",
        className: "hover:bg-primary hover:text-black"
      },
      {
        colorSchema: "primary",
        variant: "outline_bg",
        className:
          "bg-mineshaft-700 border border-mineshaft-600 hover:bg-primary/[0.15] hover:border-primary/60 text-bunker-200 hover:text-bunker-100 duration-100"
      },
      {
        colorSchema: "danger",
        variant: "star",
        className: "hover:bg-red hover:text-white"
      },
      {
        colorSchema: "primary",
        variant: "outline",
        className: "text-primary hover:bg-primary hover:text-black"
      },
      {
        colorSchema: "secondary",
        variant: "outline",
        className: "hover:bg-mineshaft"
      },
      {
        colorSchema: "danger",
        variant: "outline",
        className: "text-red hover:bg-red hover:text-black"
      },
      {
        colorSchema: "primary",
        variant: "plain",
        className: "hover:text-primary"
      },
      {
        colorSchema: "secondary",
        variant: "plain",
        className: "text-mineshaft"
      },
      {
        colorSchema: "danger",
        variant: "plain",
        className: "hover:text-red"
      },
      {
        colorSchema: ["danger", "primary", "secondary"],
        variant: ["plain"],
        className: "bg-transparent py-1 px-1 text-bunker-300"
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
