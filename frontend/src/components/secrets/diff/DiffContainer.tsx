import { useEffect } from "react";
import { twMerge } from "tailwind-merge";

import { scrollToFirstChange } from "@app/components/utilities/diff";

export interface DiffContainerProps {
  variant: "added" | "removed";
  children: React.ReactNode;
  containerRef?: React.RefObject<HTMLDivElement>;
  className?: string;
  isSingleLine?: boolean;
}

/**
 * Styled container with scroll-to-first-change behavior and consistent backgrounds
 */
export const DiffContainer = ({
  variant,
  children,
  containerRef,
  className,
  isSingleLine = false
}: DiffContainerProps) => {
  const backgroundColor = variant === "removed" ? "#120808" : "#081208";

  useEffect(() => {
    if (!isSingleLine && containerRef?.current) {
      const timeout = setTimeout(() => {
        scrollToFirstChange(containerRef.current);
      }, 100);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [containerRef, isSingleLine]);

  if (isSingleLine) {
    return (
      <div
        className={twMerge("relative rounded-lg border border-mineshaft-600 p-2", className)}
        style={{ backgroundColor }}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={twMerge(
        "relative max-h-96 thin-scrollbar overflow-x-auto overflow-y-auto rounded-lg border border-mineshaft-600 p-2",
        className
      )}
      style={{ backgroundColor }}
    >
      <div className="w-max min-w-full">{children}</div>
    </div>
  );
};
