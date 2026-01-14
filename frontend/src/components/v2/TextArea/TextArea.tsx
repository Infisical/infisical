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
  "textarea w-full p-2 focus:ring-2 ring-primary-800 outline-hidden border text-gray-400 font-inter placeholder-gray-500/50",
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
        filled: ["bg-mineshaft-900", "text-gray-400"],
        outline: ["bg-transparent"],
        plain: "bg-transparent outline-hidden"
      },
      isError: {
        true: "focus:ring-red/50 placeholder-red-300 border-red",
        false: "focus:ring-primary-400/50 focus:ring-1 border-mineshaft-500"
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
      style={{ resize: reSize }}
      required={isRequired}
      ref={ref}
      disabled={isDisabled}
      className={twMerge(textAreaVariants({ className, isError, size, isRounded, variant }))}
      {...props}
    />
  )
);

TextArea.displayName = "TextArea";
