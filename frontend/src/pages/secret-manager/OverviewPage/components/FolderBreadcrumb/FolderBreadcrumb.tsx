import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FolderIcon, SlashIcon } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger
} from "@app/components/v3";

type Props = {
  secretPath?: string;
  onResetSearch: (secretPath: string) => void;
};

type Measurements = {
  containerWidth: number;
  segmentWidths: number[];
  ellipsisWidth: number;
  folderIconWidth: number;
  separatorWidth: number;
};

export function FolderBreadcrumb({ secretPath = "", onResetSearch }: Props) {
  const navigate = useNavigate({
    from: "/organizations/$orgId/projects/secret-management/$projectId/overview"
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const measureContainerRef = useRef<HTMLDivElement>(null);

  const [measurements, setMeasurements] = useState<Measurements>({
    containerWidth: 0,
    segmentWidths: [],
    ellipsisWidth: 0,
    folderIconWidth: 0,
    separatorWidth: 0
  });

  const folderPaths = useMemo(() => (secretPath || "").split("/").filter(Boolean), [secretPath]);

  const onFolderCrumbClick = useCallback(
    (index: number) => {
      const newSecPath = `/${secretPath.split("/").filter(Boolean).slice(0, index).join("/")}`;
      if (secretPath === newSecPath) return;
      navigate({
        search: (prev) => ({ ...prev, secretPath: newSecPath })
      }).then(() => onResetSearch(newSecPath));
    },
    [secretPath, navigate, onResetSearch]
  );

  // Measure all elements and track container width
  const measureElements = useCallback(() => {
    const container = containerRef.current;
    const measureContainer = measureContainerRef.current;
    if (!container || !measureContainer) return;

    const containerWidth = container.getBoundingClientRect().width;
    const folderIcon = measureContainer.querySelector("[data-measure='folder-icon']");
    const separator = measureContainer.querySelector("[data-measure='separator']");
    const ellipsis = measureContainer.querySelector("[data-measure='ellipsis']");
    const segments = measureContainer.querySelectorAll("[data-measure='segment']");

    const segmentWidths = Array.from(segments).map((el) => el.getBoundingClientRect().width);

    setMeasurements((prev) => {
      // Only update if values changed to prevent unnecessary re-renders
      const newMeasurements = {
        containerWidth,
        segmentWidths,
        ellipsisWidth: ellipsis?.getBoundingClientRect().width ?? 0,
        folderIconWidth: folderIcon?.getBoundingClientRect().width ?? 0,
        separatorWidth: separator?.getBoundingClientRect().width ?? 0
      };

      if (
        prev.containerWidth === newMeasurements.containerWidth &&
        prev.ellipsisWidth === newMeasurements.ellipsisWidth &&
        prev.folderIconWidth === newMeasurements.folderIconWidth &&
        prev.separatorWidth === newMeasurements.separatorWidth &&
        prev.segmentWidths.length === newMeasurements.segmentWidths.length &&
        prev.segmentWidths.every((w, i) => w === newMeasurements.segmentWidths[i])
      ) {
        return prev;
      }

      return newMeasurements;
    });
  }, []);

  // Initial measurement and re-measure on path change
  useEffect(() => {
    measureElements();
  }, [measureElements, folderPaths]);

  // Track container width with ResizeObserver
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return () => {};

    const observer = new ResizeObserver(() => {
      measureElements();
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [measureElements]);

  // Calculate visible segments based on actual measurements
  const { startCount, endCount, needsEllipsis } = useMemo(() => {
    const { containerWidth, segmentWidths, ellipsisWidth, folderIconWidth, separatorWidth } =
      measurements;

    // Before measurements are ready, show minimal state to prevent overflow
    if (segmentWidths.length === 0 || containerWidth === 0) {
      return { startCount: 1, endCount: 1, needsEllipsis: folderPaths.length > 2 };
    }

    // Gap between items: gap-1.5 (6px) on mobile, sm:gap-3 (12px) on larger screens
    // We use 12px as a safe default since we can't easily detect breakpoint
    const GAP = 12;

    // Calculate total width of all segments (including separators and gaps)
    // Each segment has: gap + separator + gap + segment text
    const totalSegmentWidth = segmentWidths.reduce(
      (sum, w) => sum + w + separatorWidth + GAP * 2,
      0
    );
    const availableWidth = containerWidth - folderIconWidth - GAP;

    // If everything fits, show all
    if (totalSegmentWidth <= availableWidth) {
      return { startCount: folderPaths.length, endCount: 0, needsEllipsis: false };
    }

    // Need to collapse - prioritize showing the last segment
    const ellipsisFullWidth = ellipsisWidth + separatorWidth + GAP * 2;
    const lastSegmentFullWidth = segmentWidths[segmentWidths.length - 1] + separatorWidth + GAP * 2;
    const firstSegmentFullWidth = segmentWidths[0] + separatorWidth + GAP * 2;

    // Minimum: just ellipsis + last segment
    const minWidth = ellipsisFullWidth + lastSegmentFullWidth;

    // If we can't even fit ellipsis + last, just show what we can
    if (minWidth > availableWidth) {
      return { startCount: 0, endCount: 1, needsEllipsis: true };
    }

    // Check if we can fit first + ellipsis + last
    const withFirstWidth = minWidth + firstSegmentFullWidth;
    let start = withFirstWidth <= availableWidth ? 1 : 0;
    let end = 1;
    let usedWidth = start === 1 ? withFirstWidth : minWidth;

    // Greedily add segments from end first (more relevant), then start
    let addedFromEnd = true;
    while (usedWidth < availableWidth && start + end < folderPaths.length) {
      if (addedFromEnd && end < folderPaths.length - start) {
        const nextEndIdx = folderPaths.length - end - 1;
        const nextWidth = segmentWidths[nextEndIdx] + separatorWidth + GAP * 2;
        if (usedWidth + nextWidth <= availableWidth) {
          end += 1;
          usedWidth += nextWidth;
        } else {
          break;
        }
      } else if (start < folderPaths.length - end) {
        const nextWidth = segmentWidths[start] + separatorWidth + GAP * 2;
        if (usedWidth + nextWidth <= availableWidth) {
          start += 1;
          usedWidth += nextWidth;
        } else {
          break;
        }
      } else {
        break;
      }
      addedFromEnd = !addedFromEnd;
    }

    const needsCollapse = start + end < folderPaths.length;
    return {
      startCount: start,
      endCount: needsCollapse ? end : 0,
      needsEllipsis: needsCollapse
    };
  }, [measurements, folderPaths.length]);

  // Derive visible segments
  const startSegments = needsEllipsis ? folderPaths.slice(0, startCount) : folderPaths;
  const endSegments = needsEllipsis && endCount > 0 ? folderPaths.slice(-endCount) : [];
  const hiddenSegments = needsEllipsis
    ? folderPaths.slice(startCount, endCount > 0 ? folderPaths.length - endCount : undefined)
    : [];

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1 overflow-hidden">
      {/* Hidden measurement container */}
      <div
        ref={measureContainerRef}
        className="pointer-events-none invisible absolute flex items-center gap-1.5 whitespace-nowrap sm:gap-3"
        aria-hidden="true"
      >
        <span data-measure="folder-icon" className="inline-flex items-center">
          <FolderIcon className="size-4" />
        </span>
        <span data-measure="separator" className="inline-flex items-center">
          <SlashIcon className="size-3 -rotate-12" />
        </span>
        {folderPaths.map((path, index) => (
          <span
            key={`measure-${path}-${index + 1}`}
            data-measure="segment"
            className="inline-flex items-center text-sm"
          >
            {path}
          </span>
        ))}
        <span data-measure="ellipsis" className="inline-flex size-6 items-center justify-center">
          <BreadcrumbEllipsis className="size-6" />
        </span>
      </div>

      {/* Visible breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList className="flex-nowrap">
          {/* Root folder icon */}
          <BreadcrumbItem onClick={() => onFolderCrumbClick(0)}>
            <BreadcrumbLink>
              <FolderIcon />
            </BreadcrumbLink>
          </BreadcrumbItem>

          {/* Start segments */}
          {startSegments.map((path, index) => (
            <React.Fragment key={`start-${path}-${index + 1}`}>
              <BreadcrumbSeparator>
                <SlashIcon className="size-3 -rotate-12" />
              </BreadcrumbSeparator>
              {!needsEllipsis && index === startSegments.length - 1 ? (
                <BreadcrumbPage title={path} className="truncate">
                  {path}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbItem
                  onClick={() => onFolderCrumbClick(index + 1)}
                  onKeyDown={() => null}
                >
                  <BreadcrumbLink title={path} className="truncate">
                    {path}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              )}
            </React.Fragment>
          ))}

          {/* Ellipsis dropdown for hidden segments */}
          {needsEllipsis && hiddenSegments.length > 0 && (
            <>
              <BreadcrumbSeparator>
                <SlashIcon className="size-3 -rotate-12" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <UnstableDropdownMenu>
                  <UnstableDropdownMenuTrigger asChild>
                    <span className="data-[state=open]:[&>*]:bg-foreground/10">
                      <BreadcrumbEllipsis className="size-6 cursor-pointer rounded hover:bg-foreground/10" />
                    </span>
                  </UnstableDropdownMenuTrigger>
                  <UnstableDropdownMenuContent
                    className="relative max-w-[300px] pl-3"
                    align="start"
                  >
                    <div className="absolute top-3 bottom-[23px] left-[8px] w-px bg-muted/50" />
                    {hiddenSegments.map((segment, idx) => {
                      const originalIndex = startCount + idx;
                      return (
                        <UnstableDropdownMenuItem
                          key={`hidden-${originalIndex}`}
                          onClick={() => onFolderCrumbClick(originalIndex + 1)}
                          className="text-accent hover:text-foreground"
                          title={segment}
                        >
                          <div className="absolute top-1/2 -left-[3px] h-px w-2 bg-muted/50 transition-colors" />

                          <FolderIcon className="text-folder" />
                          <span className="truncate">{segment}</span>
                        </UnstableDropdownMenuItem>
                      );
                    })}
                  </UnstableDropdownMenuContent>
                </UnstableDropdownMenu>
              </BreadcrumbItem>
            </>
          )}

          {/* End segments */}
          {endSegments.map((path, index) => {
            const originalIndex = folderPaths.length - endCount + index;
            const isLast = index === endSegments.length - 1;
            return (
              <React.Fragment key={`end-${originalIndex}`}>
                <BreadcrumbSeparator>
                  <SlashIcon className="size-3 -rotate-12" />
                </BreadcrumbSeparator>
                {isLast ? (
                  <BreadcrumbPage title={path} className="truncate">
                    {path}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbItem
                    onClick={() => onFolderCrumbClick(originalIndex + 1)}
                    onKeyDown={() => null}
                  >
                    <BreadcrumbLink title={path} className="truncate">
                      {path}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                )}
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
