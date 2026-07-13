import { forwardRef } from "react";

import { cn } from "../../utils";

const Input = forwardRef<HTMLInputElement, React.ComponentProps<"input"> & { isError?: boolean }>(
  ({ className, type, isError, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          "h-9 w-full min-w-0 rounded-md border border-border bg-transparent px-3 py-1 text-sm text-foreground shadow-xs transition-colors outline-1 outline-offset-4 outline-transparent outline-solid file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          "hover:border-foreground/20 focus-visible:border-accent focus-visible:outline-accent/60",
          "aria-invalid:border-danger aria-invalid:focus-visible:outline-danger/60",
          "selection:bg-foreground selection:text-background",
          className
        )}
        aria-invalid={isError}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export { Input };
