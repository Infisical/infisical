import * as React from "react";

import { cn } from "../../utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded border border-border bg-container px-1.5 font-mono text-[10px] leading-none font-medium text-foreground select-none",
        className
      )}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="kbd-group" className={cn("flex items-center gap-0.5", className)} {...props} />
  );
}

export { Kbd, KbdGroup };
