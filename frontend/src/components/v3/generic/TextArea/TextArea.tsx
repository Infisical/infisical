/* eslint-disable react/prop-types */
import * as React from "react";

import { cn } from "../../utils";

const TextArea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea"> & { isError?: boolean }
>(({ className, isError, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(
        "placeholder:text-muted-foreground flex min-h-16 thin-scrollbar w-full rounded-md border border-border bg-transparent px-3 py-2 text-base text-foreground shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger/40 md:text-sm",
        className
      )}
      aria-invalid={isError}
      {...props}
    />
  );
});

TextArea.displayName = "TextArea";

export { TextArea };
