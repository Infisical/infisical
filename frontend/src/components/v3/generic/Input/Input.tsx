import { forwardRef } from "react";
import { cva, type VariantProps } from "cva";

import { cn } from "../../utils";

const inputVariants = cva(
  "h-9 w-full min-w-0 rounded-md border border-border bg-transparent px-2.5 text-sm text-foreground shadow-xs file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted disabled:bg-foreground/5 disabled:opacity-50 selection:bg-foreground selection:text-background",
  {
    variants: {
      variant: {
        default:
          "outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-danger aria-invalid:ring-danger/40",
        outlined:
          "outline-1 outline-offset-4 outline-transparent transition-colors outline-solid hover:border-foreground/20 focus-visible:border-accent focus-visible:outline-accent/60 aria-invalid:border-danger aria-invalid:focus-visible:outline-danger/60"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

type InputProps = React.ComponentProps<"input"> &
  VariantProps<typeof inputVariants> & { isError?: boolean };

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant = "default", isError, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        data-variant={variant}
        className={cn(inputVariants({ variant, className }))}
        aria-invalid={isError}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export { Input, type InputProps, inputVariants };
