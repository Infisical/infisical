import * as React from "react";

import { cn } from "../lib/utils";

import controlStyles from "./controls.module.css";

const Skeleton = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div"> & {
    width?: React.CSSProperties["width"];
    height?: React.CSSProperties["height"];
    lines?: number;
  }
>(({ className, width, height, lines, style, ...props }, ref) => {
  if (lines)
    return (
      <div
        ref={ref}
        data-slot="skeleton-lines"
        aria-hidden="true"
        className="flex flex-col gap-2"
        style={{ width, ...style }}
        {...props}
      >
        {Array.from({ length: Math.min(100, Math.max(1, Math.floor(lines))) }, (_, index) => (
          <Skeleton
            key={index}
            height={height ?? 12}
            width={index === lines - 1 && lines > 1 ? "60%" : "100%"}
            className={className}
          />
        ))}
      </div>
    );
  return (
    <div
      ref={ref}
      data-slot="skeleton"
      aria-hidden="true"
      style={{ width, height, ...style }}
      className={cn(
        controlStyles.skeleton,
        "animate-pulse bg-[color:var(--v4-line-soft)] motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  );
});
Skeleton.displayName = "Skeleton";

export { Skeleton };
