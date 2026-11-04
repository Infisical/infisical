import { forwardRef, useId, useImperativeHandle, useRef } from "react";
import { cva, type VariantProps } from "cva";

import { cn } from "../../utils";
import { Kbd } from "../Kbd";

const inputVariants = cva(
  "w-full min-w-0 rounded-md border border-border bg-transparent text-foreground shadow-xs file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted [&[readonly]]:border-border/50 disabled:pointer-events-none disabled:border-border/50 disabled:text-foreground/50 disabled:placeholder:text-muted/50 selection:bg-foreground selection:text-background",
  {
    variants: {
      variant: {
        default:
          "outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-danger aria-invalid:ring-danger/40",
        outlined:
          "outline-1 outline-offset-4 outline-transparent transition-colors outline-solid [&:not([readonly]):not(:disabled):hover]:border-foreground/20 focus-visible:border-accent focus-visible:outline-accent/60 aria-invalid:border-danger aria-invalid:focus-visible:outline-danger/60"
      },
      size: {
        default: "h-9 px-2.5 text-sm",
        sm: "h-6 px-1.5 text-xs"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

type InputProps = Omit<React.ComponentProps<"input">, "size"> &
  VariantProps<typeof inputVariants> & {
    isError?: boolean;
    "data-1p-ignore"?: boolean;
    suggestedValue?: string;
  };

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      variant = "default",
      size = "default",
      isError,
      autoComplete,
      "data-1p-ignore": ignorePasswordManager = !/email|password|username/i.test(
        autoComplete ?? ""
      ),
      suggestedValue,
      placeholder,
      onKeyDown,
      "aria-describedby": ariaDescribedBy,
      ...props
    },
    ref
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const suggestionHintId = useId();
    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const acceptSuggestion = () => {
      const el = inputRef.current;
      if (!el || !suggestedValue) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        el,
        suggestedValue
      );
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };

    const input = (
      <input
        ref={inputRef}
        type={type}
        data-slot="input"
        data-variant={variant}
        data-size={size}
        autoComplete={autoComplete}
        data-1p-ignore={ignorePasswordManager || undefined}
        className={cn(inputVariants({ variant, size, className }), suggestedValue && "peer pr-14")}
        aria-invalid={isError}
        placeholder={suggestedValue || placeholder}
        aria-describedby={
          suggestedValue && !props.readOnly && !props.disabled
            ? [ariaDescribedBy, suggestionHintId].filter(Boolean).join(" ")
            : ariaDescribedBy
        }
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (
            !suggestedValue ||
            e.defaultPrevented ||
            e.key !== "Tab" ||
            e.shiftKey ||
            e.currentTarget.readOnly ||
            e.currentTarget.value
          )
            return;
          e.preventDefault();
          acceptSuggestion();
        }}
        {...props}
      />
    );

    if (!suggestedValue) return input;

    return (
      <div data-slot="input-suggestion" className="relative w-full min-w-0">
        {input}
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Use suggested value ${suggestedValue}`}
          title="Use suggested value"
          className="absolute top-1/2 right-2 hidden -translate-y-1/2 cursor-pointer peer-placeholder-shown:flex peer-read-only:hidden peer-disabled:hidden"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            acceptSuggestion();
            inputRef.current?.focus();
          }}
        >
          <Kbd>Tab</Kbd>
        </button>
        <span id={suggestionHintId} className="sr-only">
          When the field is empty, press Tab to use the suggested value.
        </span>
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input, type InputProps, inputVariants };
