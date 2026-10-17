import * as React from "react";

import { cn } from "@app/components/v4/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-v4-control border border-v4-control bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-v4-muted focus-visible:border-ring focus-visible:outline-3 focus-visible:outline-v4-nudge focus-visible:outline-solid disabled:cursor-not-allowed disabled:bg-v4-control/50 disabled:opacity-50 aria-invalid:border-v4-bad-control aria-invalid:focus-visible:border-v4-bad aria-invalid:focus-visible:outline-v4-bad-nudge md:text-sm dark:bg-v4-control/30 dark:disabled:bg-v4-control/80",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
