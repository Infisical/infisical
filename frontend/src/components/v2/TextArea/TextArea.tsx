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
  "textarea w-full p-2 focus:ring-2 ring-project outline-hidden border text-muted font-inter placeholder:text-muted/50",
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
        filled: ["bg-card", "text-muted"],
        outline: ["bg-transparent"],
        plain: "bg-transparent outline-hidden"
      },
      isError: {
        true: "focus:ring-danger/50 placeholder:text-danger border-danger",
        false: "focus:ring-project/50 focus:ring-1 border-border"
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
