import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@app/components/v3/utils";

import { Button } from "../Button";

type SelectedActionBarProps = Omit<React.ComponentProps<"div">, "children"> & {
  selectedCount: number;
  onClearSelection: () => void;
  children: React.ReactNode;
  selectionLabel?: React.ReactNode;
  clearLabel?: string;
};

function SelectedActionBar({
  selectedCount,
  onClearSelection,
  children,
  selectionLabel,
  clearLabel = "Unselect All",
  className,
  "aria-label": ariaLabel = "Selection actions",
  ...props
}: SelectedActionBarProps) {
  const isVisible = selectedCount > 0;
  const lastVisibleContent = React.useRef({ children, selectedCount, selectionLabel });

  if (isVisible) {
    lastVisibleContent.current = { children, selectedCount, selectionLabel };
  }

  const displayedContent = isVisible
    ? { children, selectedCount, selectionLabel }
    : lastVisibleContent.current;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-slot="selected-action-bar-positioner"
      className={cn(
        "pointer-events-none fixed inset-x-4 bottom-16 z-40 flex justify-center",
        "transition-[opacity,translate,filter,scale] ease-out motion-reduce:transition-none",
        isVisible
          ? "translate-y-0 opacity-100 duration-200 blur-none scale-100"
          : "translate-y-3 opacity-0 duration-100 blur-[4px] scale-98"
      )}
      aria-hidden={!isVisible}
      // React 18 does not type the inert attribute yet.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(!isVisible ? { inert: "" as any } : {})}
    >
      <div
        {...props}
        role="toolbar"
        aria-label={ariaLabel}
        data-slot="selected-action-bar"
        data-state={isVisible ? "open" : "closed"}
        className={cn(
          "pointer-events-auto flex max-h-[calc(100vh-2rem)] w-full max-w-xl flex-wrap items-center gap-2 overflow-y-auto rounded-md border border-border bg-popover p-2 pl-4 text-foreground shadow-lg",
          className
        )}
      >
        <div
          className={cn(
            "flex w-full flex-wrap items-center gap-2 transition-opacity duration-50",
            isVisible ? "opacity-100 delay-0" : "opacity-0 delay-50"
          )}
        >
          <span className="shrink-0 text-sm">
            {displayedContent.selectionLabel ?? `${displayedContent.selectedCount} Selected`}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="mr-auto text-accent underline-offset-2 hover:underline"
            onClick={onClearSelection}
          >
            {clearLabel}
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {displayedContent.children}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export { SelectedActionBar, type SelectedActionBarProps };
