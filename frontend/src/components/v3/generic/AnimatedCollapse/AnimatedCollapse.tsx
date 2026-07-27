/* eslint-disable react/prop-types */

import * as React from "react";

import { cn } from "../../utils";

type AnimatedCollapseProps = React.ComponentProps<"div"> & {
  isOpen: boolean;
  contentClassName?: string;
};

function AnimatedCollapse({
  children,
  className,
  contentClassName,
  isOpen,
  ...props
}: AnimatedCollapseProps) {
  return (
    <div
      {...props}
      data-slot="animated-collapse"
      data-state={isOpen ? "open" : "closed"}
      aria-hidden={!isOpen}
      // React 18 does not type the inert attribute yet.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(!isOpen ? { inert: "" as any } : {})}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-in-out motion-reduce:transition-none",
        isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className
      )}
    >
      <div className={cn("min-h-0 overflow-hidden", contentClassName)}>{children}</div>
    </div>
  );
}

export { AnimatedCollapse, type AnimatedCollapseProps };
