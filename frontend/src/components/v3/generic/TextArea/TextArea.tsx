import * as React from "react";
import { cva, type VariantProps } from "cva";

import { cn } from "../../utils";

const textAreaVariants = cva(
  "placeholder:text-muted flex min-h-16 thin-scrollbar w-full rounded-md border border-border bg-transparent px-2.5 py-2 text-sm text-foreground shadow-xs [&[readonly]]:border-border/50 disabled:pointer-events-none disabled:border-border/50 disabled:text-foreground/50 disabled:placeholder:text-muted/50",
  {
    variants: {
      variant: {
        default:
          "outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-danger aria-invalid:ring-danger/40",
        outlined:
          "outline-1 outline-offset-4 outline-transparent transition-colors outline-solid [&:not([readonly]):not(:disabled):hover]:border-foreground/20 focus-visible:border-accent focus-visible:outline-accent/60 aria-invalid:border-danger aria-invalid:focus-visible:outline-danger/60"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

type TextAreaProps = React.ComponentProps<"textarea"> &
  VariantProps<typeof textAreaVariants> & { isError?: boolean };

const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className, variant = "default", isError, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        data-slot="textarea"
        data-variant={variant}
        className={cn(textAreaVariants({ variant, className }))}
        aria-invalid={isError}
        {...props}
      />
    );
  }
);

TextArea.displayName = "TextArea";

export { TextArea, type TextAreaProps, textAreaVariants };
