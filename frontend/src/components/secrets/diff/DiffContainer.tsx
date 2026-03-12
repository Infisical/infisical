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
  if (isSingleLine) {
    return (
      <div
        className={twMerge(
          "relative overflow-x-auto thin-scrollbar rounded-md border border-border p-2",
          "bg-bunker-800/60",
          variant && variant === "added" && "border-success/45",
          variant && variant === "removed" && "border-danger/45",
          className
        )}
      >
        <div className="w-max min-w-full">{children}</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={twMerge(
        "relative max-h-96 thin-scrollbar overflow-x-auto overflow-y-auto rounded-md border border-border p-2",
        "bg-bunker-800/60",
        variant && variant === "added" && "border-success/45",
        variant && variant === "removed" && "border-danger/45",
        className
      )}
    >
      <div className="w-max min-w-full">{children}</div>
    </div>
  );
};
