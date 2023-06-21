import { forwardRef, TextareaHTMLAttributes } from "react";
import { cva, VariantProps } from "cva";
import { twMerge } from "tailwind-merge";

type Props = {
  isDisabled?: boolean;
  placeholder?: string;
  isFullWidth?: boolean;
  isRequired?: boolean;
  reSize?: "none" | "both" | "vertical" | "horizontal";
};

const textAreaVariants = cva(
  "textarea w-full p-2 focus:ring-2 ring-primary-800 outline-none border border-solid text-gray-400 font-inter placeholder-gray-500 placeholder-opacity-50",
  {
    variants: {
      size: {
        xs: ["text-xs"],
        sm: ["text-sm"],
        md: ["text-md"],
        lg: ["text-lg"]
      },
      isRounded: {
        true: ["rounded-md"],
        false: ""
      },
      variant: {
        filled: ["bg-bunker-800", "text-gray-400"],
        outline: ["bg-transparent"],
        plain: "bg-transparent outline-none"
      },
      isError: {
        true: "focus:ring-red/50 placeholder-red-300 border-red",
        false: "focus:ring-primary/50 border-mineshaft-400"
      }
    },
    compoundVariants: [
      {
        variant: "plain",
        isError: [true, false],
        className: "border-none"
      }
    ]
  }
);

export type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size" | "disabled"> &
  VariantProps<typeof textAreaVariants> &
  Props;

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  (
    {
      className,
      isRounded = true,
      isDisabled = false,
      isError = false,
      isRequired,
      variant = "filled",
      size = "md",
      reSize = "both",
      ...props
    },
    ref
  ): JSX.Element => (
    <textarea
      {...props}
      style={{ resize: reSize }}
      required={isRequired}
      ref={ref}
      disabled={isDisabled}
      className={twMerge(textAreaVariants({ className, isError, size, isRounded, variant }))}
    />
  )
);

TextArea.displayName = "TextArea";
