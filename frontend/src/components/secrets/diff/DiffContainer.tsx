import { twMerge } from "tailwind-merge";

export interface DiffContainerProps {
  variant?: "added" | "removed";
  children: React.ReactNode;
  containerRef?: React.RefObject<HTMLDivElement>;
  className?: string;
  isSingleLine?: boolean;
}

/**
 * Styled container with consistent backgrounds for diff views
 */
export const DiffContainer = ({
  variant,
  children,
  containerRef,
  className,
  isSingleLine = false
}: DiffContainerProps) => {
  const getBackgroundColor = () => {
    if (!variant) return undefined;
    return variant === "removed" ? "#120808" : "#081208";
  };

  const backgroundColor = getBackgroundColor();

  if (isSingleLine) {
    return (
      <div
        className={twMerge(
          "relative rounded-lg border border-mineshaft-600 p-2",
          !variant && "bg-bunker-800",
          className
        )}
        style={backgroundColor ? { backgroundColor } : undefined}
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
        !variant && "bg-bunker-800",
        className
      )}
      style={backgroundColor ? { backgroundColor } : undefined}
    >
      <div className="w-max min-w-full">{children}</div>
    </div>
  );
};
