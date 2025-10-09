/* eslint-disable react/prop-types */

import { ChangeEvent, forwardRef, InputHTMLAttributes, ReactNode } from "react";
import { cva, VariantProps } from "cva";

import { cn } from "@app/components/v3/utils";

type Props = {
  placeholder?: string;
  isFullWidth?: boolean;
  isRequired?: boolean;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRounded?: boolean;
  autoCapitalization?: boolean;
  containerClassName?: string;
};

const inputVariants = cva(
  cn(
    "flex-1 pt-0.5 bg-input  text-foreground placeholder:text-placeholder outline-none",
    "shrink-0"
  ),
  {
    variants: {
      size: {
        xs: "text-xs",
        sm: "text-sm",
        md: "text-sm",
        lg: "text-sm"
      },
      isRounded: {
        true: "rounded-[4px]"
      },
      isDisabled: { true: "pointer-events-none" }
    },
    defaultVariants: {
      size: "md"
    }
  }
);

const inputParentContainerVariants = cva(
  cn(
    "inline-flex bg-input items-center border",
    "[&>svg]:pointer-events-none [&>svg]:text-placeholder [&>svg]:stroke-[2] [&>svg]:shrink-0"
  ),
  {
    variants: {
      size: {
        xs: "h-7 [&>button]:h-4 px-1.5 [&>button]:w-4 [&>button]:text-[10px] gap-x-1.5 [&>button]:px-0 [&>svg]:size-[12px]",
        sm: "h-8 [&>button]:h-5 px-2 [&>button]:w-5 [&>button]:text-xs [&>button]:px-1 gap-x-2 [&>svg]:size-[14px]",
        md: "h-9 [&>button]:h-5 px-2 [&>button]:w-5 [&>button]:text-xs [&>button]:px-1 gap-x-2 [&>svg]:size-[14px]",
        lg: "h-10 [&>button]:h-5 px-2 [&>button]:w-5 [&>button]:text-xs [&>button]:px-1 gap-x-2 [&>svg]:size-[14px]"
      },
      isRounded: {
        true: "rounded-[4px]"
      },
      isError: {
        true: "border-danger",
        false: "border-border has-[:is(input):focus]:ring-2 has-[:is(input):focus]:ring-ring"
      },
      isReadOnly: {
        true: "!ring-0 !border-border"
      },
      isFullWidth: {
        true: "w-full",
        false: ""
      },
      isDisabled: {
        true: "opacity-75 cursor-not-allowed"
      }
    }
  }
);

type InputVariantProps = VariantProps<typeof inputParentContainerVariants>;

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "disabled" | "readOnly"> &
  InputVariantProps &
  Props;

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      containerClassName,
      startAdornment,
      endAdornment,
      size = "md",
      isReadOnly = false,
      isFullWidth = true,
      isDisabled = false,
      isError = false,
      isRounded = true,
      isRequired = false,
      autoCapitalization = false,
      ...props
    },
    ref
  ): JSX.Element => {
    const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
      if (autoCapitalization) {
        // eslint-disable-next-line no-param-reassign
        event.target.value = event.target.value.toUpperCase();
      }
    };

    return (
      <div
        className={inputParentContainerVariants({
          isError,
          isFullWidth,
          isDisabled,
          className: containerClassName,
          size,
          isRounded,
          isReadOnly
        })}
      >
        {startAdornment}
        <input
          {...props}
          ref={ref}
          required={isRequired}
          aria-required={isRequired}
          aria-readonly={isReadOnly}
          readOnly={isReadOnly}
          disabled={isDisabled}
          onInput={handleInput}
          className={inputVariants({ className, size, isRounded, isDisabled })}
        />
        {endAdornment}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input, type InputProps };
