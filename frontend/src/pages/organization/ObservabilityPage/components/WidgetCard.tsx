import { forwardRef, useCallback, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { GripVertical, X } from "lucide-react";
import { twMerge } from "tailwind-merge";

import type { LayoutItem, WidgetTemplate } from "../mock-data";
import { LogsWidget } from "./LogsWidget";
import { TableWidget } from "./TableWidget";

const ROW_HEIGHT = 200;

interface WidgetCardProps {
  item: LayoutItem;
  templates: Record<string, WidgetTemplate>;
  onRemove: (uid: string) => void;
  onResize: (uid: string, cols: number, rows: number) => void;
  onEdit?: (uid: string, tmplKey: string) => void;
}

export function SortableWidgetCard({
  item,
  templates,
  onRemove,
  onResize,
  onEdit
}: WidgetCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.uid
  });

  const template = templates[item.tmpl];
  if (!template) return null;

  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
      : undefined,
    transition: transition ?? undefined,
    gridColumn: `span ${item.cols}`,
    gridRow: `span ${item.rows}`,
    borderColor: isDragging ? undefined : (template.borderColor ?? undefined)
  };

  // Horizontal resize (right edge)
  const handleResizeH = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const card = (e.target as HTMLElement).closest(".widget-card");
      if (!card) return;
      const cardWidth = card.getBoundingClientRect().width;
      const colWidth = cardWidth / item.cols;

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const newCols = Math.max(2, Math.min(12, Math.round((cardWidth + dx) / colWidth)));
        if (newCols !== item.cols) onResize(item.uid, newCols, item.rows);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
      };
      document.body.style.cursor = "col-resize";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [item.cols, item.rows, item.uid, onResize]
  );

  // Vertical resize (bottom edge)
  const handleResizeV = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startY = e.clientY;
      const startH = item.rows * ROW_HEIGHT;

      const onMove = (ev: MouseEvent) => {
        const dy = ev.clientY - startY;
        const newRows = Math.max(1, Math.min(6, Math.round((startH + dy) / ROW_HEIGHT)));
        if (newRows !== item.rows) onResize(item.uid, item.cols, newRows);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
      };
      document.body.style.cursor = "row-resize";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [item.cols, item.rows, item.uid, onResize]
  );

  // Corner resize (both)
  const cornerRef = useRef({
    startX: 0,
    startY: 0,
    startCols: 0,
    startRows: 0,
    colW: 0
  });
  const handleResizeCorner = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const card = (e.target as HTMLElement).closest(".widget-card");
      if (!card) return;
      const cardWidth = card.getBoundingClientRect().width;
      cornerRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startCols: item.cols,
        startRows: item.rows,
        colW: cardWidth / item.cols
      };
      const onMove = (ev: MouseEvent) => {
        const { startX, startY, startCols, startRows, colW } = cornerRef.current;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const newCols = Math.max(2, Math.min(12, Math.round((startCols * colW + dx) / colW)));
        const newRows = Math.max(
          1,
          Math.min(6, Math.round((startRows * ROW_HEIGHT + dy) / ROW_HEIGHT))
        );
        if (newCols !== item.cols || newRows !== item.rows) onResize(item.uid, newCols, newRows);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
      };
      document.body.style.cursor = "nwse-resize";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [item.cols, item.rows, item.uid, onResize]
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={twMerge(
        "widget-card group relative flex flex-col rounded-[10px] border border-mineshaft-600 bg-mineshaft-800",
        isDragging && "z-50 opacity-40 shadow-2xl ring-2 ring-primary/40",
        !isDragging && "hover:border-mineshaft-500"
      )}
      {...attributes}
    >
      {/* Remove button */}
      <button
        type="button"
        onClick={() => onRemove(item.uid)}
        className="absolute -right-2 -top-2 z-30 hidden h-5 w-5 items-center justify-center rounded-full border border-[#6e1a1a] bg-[#2b0d0d] text-red-400 shadow-md transition-colors hover:bg-[#3d1010] group-hover:flex"
        aria-label="Remove widget"
      >
        <X size={10} />
      </button>

      {/* Right resize edge */}
      <div
        className="absolute right-0 top-0 z-20 h-full w-1 cursor-col-resize transition-colors hover:bg-primary"
        onMouseDown={handleResizeH}
      />

      {/* Bottom resize edge */}
      <div
        className="absolute bottom-0 left-0 z-20 h-1 w-full cursor-row-resize transition-colors hover:bg-primary"
        onMouseDown={handleResizeV}
      />

      {/* Corner resize handle */}
      <div
        className="absolute bottom-0 right-0 z-30 h-3 w-3 cursor-nwse-resize"
        onMouseDown={handleResizeCorner}
      >
        <div className="absolute bottom-0 right-0 h-1 w-3 transition-colors group-hover:bg-primary" />
        <div className="absolute bottom-0 right-0 h-3 w-1 transition-colors group-hover:bg-primary" />
      </div>

      {/* Widget content */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-[10px]">
        {template.isLogs ? (
          <LogsWidget dragHandleProps={listeners} />
        ) : (
          <TableWidget
            template={template}
            dragHandleProps={listeners}
            onEdit={
              onEdit && template.filter ? () => onEdit(item.uid, item.tmpl) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}

export const WidgetCardOverlay = forwardRef<
  HTMLDivElement,
  { item: LayoutItem; templates: Record<string, WidgetTemplate> }
>(function WidgetCardOverlay({ item, templates }, ref) {
  const template = templates[item.tmpl];
  if (!template) return null;
  return (
    <div
      ref={ref}
      className="flex items-center gap-2 rounded-lg border-2 border-primary/60 bg-mineshaft-800/95 px-4 py-3 shadow-2xl backdrop-blur-sm"
      style={{ width: 280 }}
    >
      <GripVertical size={14} className="text-primary/60" />
      <span className="text-[13px] font-medium text-bunker-100">{template.title}</span>
    </div>
  );
});
