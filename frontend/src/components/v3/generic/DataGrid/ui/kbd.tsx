// Minimal Kbd component for Dice UI DataGrid keyboard shortcuts dialog
import * as React from "react";

import { cn } from "@app/components/v3/utils";

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5 items-center gap-1 rounded border border-border px-1 font-inter text-xs font-medium text-muted select-none",
        className
      )}
      {...props}
    />
  );
}

export function KbdGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-0.5", className)} {...props} />;
}
