import { ChangeEvent, forwardRef, InputHTMLAttributes, ReactNode } from "react";
import { cva, VariantProps } from "cva";
import { twMerge } from "tailwind-merge";

type Props = {
  placeholder?: string;
  isFullWidth?: boolean;
  isRequired?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  autoCapitalization?: boolean;
  containerClassName?: string;
  warning?: ReactNode;
};

const inputVariants = cva(
  "input w-full py-1.5 text-gray-400 placeholder:text-sm placeholder-gray-500/50  outline-hidden focus:ring-2 hover:ring-bunker-400/60 duration-100",
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
        true: "focus:ring-red/50 placeholder-red-300",
        false: "focus:ring-primary-400/50 focus:ring-1"
      }
    },
    compoundVariants: []
  }
);

const inputParentContainerVariants = cva("inline-flex font-inter items-center border relative", {
  variants: {
    isRounded: {
      true: ["rounded-md"],
      false: ""
    },
    isError: {
      true: "border-red",
      false: "border-mineshaft-500"
    },
    isFullWidth: {
      true: "w-full",
      false: ""
    },
    variant: {
      filled: ["bg-bunker-800", "text-gray-400"],
      outline: ["bg-transparent"],
      plain: "border-none"
    }
  }
});

const data1pIgnore = (autoComplete?: string) => {
  if (!autoComplete) return true;

  return !autoComplete.match(/(email|password|username)/i);
};

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> &
  VariantProps<typeof inputVariants> &
  Props;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      containerClassName,
      isRounded = true,
      isFullWidth = true,
      isDisabled,
      isError = false,
      isRequired,
      leftIcon,
      rightIcon,
      variant = "filled",
      size = "md",
      isReadOnly,
      autoCapitalization,
      warning,
      autoComplete,
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
          isRounded,
          isError,
          isFullWidth,
          variant,
          className: containerClassName
        })}
      >
        {leftIcon && <span className="absolute left-0 ml-3 text-sm">{leftIcon}</span>}
        <input
          {...props}
          required={isRequired}
          aria-required={isRequired}
          ref={ref}
          readOnly={isReadOnly}
          disabled={isDisabled}
          onInput={handleInput}
          autoComplete={autoComplete}
          data-1p-ignore={data1pIgnore(autoComplete)}
          className={twMerge(
            leftIcon ? "pl-10" : "pl-2.5",
            rightIcon || warning ? "pr-10" : "pr-2.5",
            inputVariants({ className, isError, size, isRounded, variant })
          )}
        />
        {Boolean(warning) && !rightIcon && warning}
        {rightIcon && <span className="absolute right-0 mr-3">{rightIcon}</span>}
      </div>
    );
  }
);

Input.displayName = "Input";
