import * as React from "react";

import { cn } from "@app/components/v4/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-v4-control border border-v4-control bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-v4-muted focus-visible:border-ring focus-visible:outline-3 focus-visible:outline-v4-nudge focus-visible:outline-solid disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-v4-control/50 disabled:opacity-50 aria-invalid:border-v4-bad-control aria-invalid:focus-visible:border-v4-bad aria-invalid:focus-visible:outline-v4-bad-nudge md:text-sm dark:bg-v4-control/30 dark:disabled:bg-v4-control/80",
        className
      )}
      {...props}
    />
  );
}

export { Input };
