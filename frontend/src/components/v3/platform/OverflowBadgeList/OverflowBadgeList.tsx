import { useLayoutEffect, useRef, useState } from "react";

import { Badge, TBadgeProps } from "../../generic/Badge";
import { Popover, PopoverContent, PopoverTrigger } from "../../generic/Popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../generic/Tooltip";
import { cn } from "../../utils";

type TOverflowBadgeListProps<T> = {
  items: T[];
  getKey: (item: T) => React.Key;
  getLabel: (item: T) => string;
  getVariant?: (item: T) => TBadgeProps["variant"];
  maxBadgeWidth?: number;
  className?: string;
};

type TOverflowLayout = {
  visibleCount: number;
  lastBadgeWidth?: number;
};

export const OverflowBadgeList = <T,>({
  items,
  getKey,
  getLabel,
  getVariant,
  maxBadgeWidth = 160,
  className
}: TOverflowBadgeListProps<T>) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const measurementRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<TOverflowLayout>({
    visibleCount: items.length
  });
  const visibleItems = items.slice(0, layout.visibleCount);
  const hiddenCount = Math.max(0, items.length - layout.visibleCount);
  const hiddenItems = items.slice(visibleItems.length);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measurement = measurementRef.current;
    if (!container || !measurement) return undefined;

    const calculateLayout = () => {
      const availableWidth = container.clientWidth;
      const badgeElements = Array.from(
        measurement.querySelectorAll<HTMLElement>("[data-overflow-badge-measure]")
      );
      const minimumBadgeElement = measurement.querySelector<HTMLElement>(
        "[data-overflow-badge-minimum]"
      );
      const rollupElements = Array.from(
        measurement.querySelectorAll<HTMLElement>("[data-overflow-rollup-measure]")
      );
      const gap = Number.parseFloat(window.getComputedStyle(container).columnGap) || 0;
      const badgeWidths = badgeElements.map((element) => element.getBoundingClientRect().width);
      const minimumBadgeWidth = minimumBadgeElement?.getBoundingClientRect().width ?? 0;
      const rollupWidths = new Map(
        rollupElements.map((element) => [
          Number(element.dataset.overflowRollupMeasure),
          element.getBoundingClientRect().width
        ])
      );

      const fullWidth = badgeWidths.reduce(
        (total, badgeWidth, index) => total + badgeWidth + (index > 0 ? gap : 0),
        0
      );
      if (fullWidth <= availableWidth) {
        setLayout({ visibleCount: items.length });
        return;
      }

      for (let visibleCount = items.length - 1; visibleCount > 0; visibleCount -= 1) {
        const hiddenItemCount = items.length - visibleCount;
        const rollupWidth = rollupWidths.get(hiddenItemCount) ?? 0;
        const gapsWidth = gap * visibleCount;
        const widthForBadges = availableWidth - rollupWidth - gapsWidth;
        const precedingBadgesWidth = badgeWidths
          .slice(0, visibleCount - 1)
          .reduce((total, width) => total + width, 0);
        const remainingWidth = widthForBadges - precedingBadgesWidth;

        if (remainingWidth >= minimumBadgeWidth) {
          const lastBadgeNaturalWidth = badgeWidths[visibleCount - 1];
          setLayout({
            visibleCount,
            lastBadgeWidth:
              remainingWidth < lastBadgeNaturalWidth ? remainingWidth : lastBadgeNaturalWidth
          });
          return;
        }
      }

      setLayout({ visibleCount: 0 });
    };

    calculateLayout();
    const resizeObserver = new ResizeObserver(calculateLayout);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [getLabel, getVariant, items, maxBadgeWidth]);

  const renderBadge = (item: T, width?: number) => {
    const label = getLabel(item);

    return (
      <Tooltip key={getKey(item)}>
        <TooltipTrigger asChild>
          <Badge
            variant={getVariant?.(item) ?? "neutral"}
            isTruncatable
            style={{
              maxWidth: width ?? maxBadgeWidth
            }}
          >
            <span>{label}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative flex min-w-0 items-center gap-2 overflow-hidden", className)}
    >
      {visibleItems.map((item, index) =>
        renderBadge(
          item,
          index === visibleItems.length - 1 && hiddenCount > 0 ? layout.lastBadgeWidth : undefined
        )
      )}
      {hiddenCount > 0 && (
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 cursor-pointer text-xs text-muted transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none"
                  onClick={(event) => event.stopPropagation()}
                >
                  +{hiddenCount}
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>
              View {hiddenCount} more {hiddenCount === 1 ? "item" : "items"}
            </TooltipContent>
          </Tooltip>
          <PopoverContent
            align="start"
            className="flex w-auto max-w-sm flex-wrap gap-1.5 p-2"
            onClick={(event) => event.stopPropagation()}
          >
            {hiddenItems.map((item) => renderBadge(item))}
          </PopoverContent>
        </Popover>
      )}
      <div
        ref={measurementRef}
        aria-hidden
        className="pointer-events-none invisible absolute flex w-max items-center"
      >
        {items.map((item) => (
          <Badge
            key={getKey(item)}
            data-overflow-badge-measure
            variant={getVariant?.(item) ?? "neutral"}
            isTruncatable
            style={{ maxWidth: maxBadgeWidth }}
          >
            <span>{getLabel(item)}</span>
          </Badge>
        ))}
        <Badge data-overflow-badge-minimum isTruncatable>
          <span />
        </Badge>
        {items.map((_, index) => {
          const rollupCount = index + 1;
          return (
            <span key={rollupCount} data-overflow-rollup-measure={rollupCount} className="text-xs">
              +{rollupCount}
            </span>
          );
        })}
      </div>
    </div>
  );
};
