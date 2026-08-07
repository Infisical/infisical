import { PointerEvent, useRef } from "react";

const MIN_COLUMN_WIDTH = 120;

type Props = {
  leftColumnId: string;
  minWidth?: number;
  onResizeEnd: (widths: Record<string, number>) => void;
  rightColumnId: string;
};

export const TableColumnResizeHandle = ({
  leftColumnId,
  minWidth = MIN_COLUMN_WIDTH,
  onResizeEnd,
  rightColumnId
}: Props) => {
  const animationFrame = useRef<number>();
  const pendingPointerX = useRef(0);
  const resizeStart = useRef({
    leftColumn: null as HTMLTableCellElement | null,
    leftWidth: 0,
    pointerX: 0,
    rightColumn: null as HTMLTableCellElement | null,
    rightWidth: 0
  });

  const resizeColumns = (pointerX: number) => {
    const {
      leftColumn,
      leftWidth,
      pointerX: startPointerX,
      rightColumn,
      rightWidth
    } = resizeStart.current;

    if (!leftColumn || !rightColumn) return undefined;

    const delta = Math.min(
      rightWidth - minWidth,
      Math.max(minWidth - leftWidth, pointerX - startPointerX)
    );
    const widths = {
      [leftColumnId]: leftWidth + delta,
      [rightColumnId]: rightWidth - delta
    };

    leftColumn.style.width = `${widths[leftColumnId]}px`;
    leftColumn.style.minWidth = `${widths[leftColumnId]}px`;
    rightColumn.style.width = `${widths[rightColumnId]}px`;
    rightColumn.style.minWidth = `${widths[rightColumnId]}px`;

    return widths;
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const rightColumn = event.currentTarget.parentElement as HTMLTableCellElement | null;
    const leftColumn = rightColumn?.previousElementSibling as HTMLTableCellElement | null;

    if (!leftColumn || !rightColumn) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pendingPointerX.current = event.clientX;
    resizeStart.current = {
      leftColumn,
      leftWidth: leftColumn.getBoundingClientRect().width,
      pointerX: event.clientX,
      rightColumn,
      rightWidth: rightColumn.getBoundingClientRect().width
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;

    pendingPointerX.current = event.clientX;
    if (animationFrame.current !== undefined) return;

    animationFrame.current = requestAnimationFrame(() => {
      resizeColumns(pendingPointerX.current);
      animationFrame.current = undefined;
    });
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;

    if (event.type === "pointerup") pendingPointerX.current = event.clientX;
    if (animationFrame.current !== undefined) cancelAnimationFrame(animationFrame.current);

    const widths = resizeColumns(pendingPointerX.current);
    animationFrame.current = undefined;
    if (widths) onResizeEnd(widths);
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="separator"
      aria-label="Resize columns"
      aria-orientation="vertical"
      className="absolute top-0 -left-px z-20 h-full w-0.5 cursor-col-resize touch-none opacity-0 transition-opacity select-none before:absolute before:inset-y-0 before:left-1/2 before:h-full before:w-[18px] before:-translate-x-1/2 before:content-[''] hover:opacity-100 active:opacity-100"
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/2 h-screen w-px -translate-x-1/2 bg-foreground"
      />
    </div>
  );
};
