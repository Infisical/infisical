import * as React from "react";

import { cn } from "../../utils";

type AnimatedCollapseVariant = "default" | "subtle";

type AnimatedCollapseProps = React.ComponentPropsWithoutRef<"div"> & {
  isOpen: boolean;
  contentClassName?: string;
  variant?: AnimatedCollapseVariant;
};

const AnimatedCollapse = React.forwardRef<HTMLDivElement, AnimatedCollapseProps>(
  ({ children, className, contentClassName, isOpen, variant = "default", ...props }, ref) => {
    const inertProps: { inert?: "" } = isOpen ? {} : { inert: "" };
    const contentStateClassName =
      variant === "subtle"
        ? isOpen
          ? "translate-y-0 opacity-100"
          : "translate-y-px opacity-0"
        : isOpen
          ? "translate-y-0 scale-100 opacity-100 blur-none"
          : "translate-y-8 scale-95 opacity-0 blur-[16px]";

    return (
      <div
        ref={ref}
        {...props}
        data-slot="animated-collapse"
        data-state={isOpen ? "open" : "closed"}
        data-variant={variant}
        aria-hidden={!isOpen}
        {...inertProps}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-in-out motion-reduce:transition-none",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          className
        )}
      >
        <div
          className={cn(
            "min-h-0 overflow-hidden transition-[all] duration-200 ease-in-out motion-reduce:transition-none",
            contentStateClassName,
            contentClassName
          )}
        >
          {children}
        </div>
      </div>
    );
  }
);

AnimatedCollapse.displayName = "AnimatedCollapse";

export { AnimatedCollapse, type AnimatedCollapseProps, type AnimatedCollapseVariant };
