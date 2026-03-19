import * as React from "react";
import type { Header, Table } from "@tanstack/react-table";

import { cn } from "@app/components/v3/utils";

interface DataGridColumnHeaderProps<TData, TValue> extends React.ComponentProps<"div"> {
  header: Header<TData, TValue>;
  table: Table<TData>;
}

export function DataGridColumnHeader<TData, TValue>({
  header,
  table,
  className,
  ...props
}: DataGridColumnHeaderProps<TData, TValue>) {
  const { column } = header;
  // eslint-disable-next-line no-nested-ternary
  const label = column.columnDef.meta?.label
    ? column.columnDef.meta.label
    : typeof column.columnDef.header === "string"
      ? column.columnDef.header
      : column.id;

  return (
    <>
      <div
        className={cn(
          "flex size-full items-center gap-2 px-3 py-1.5 text-xs text-accent select-none",
          className
        )}
        {...props}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate text-mineshaft-200">{label}</span>
          {column.columnDef.meta?.typeLabel && (
            <span className="shrink-0 font-normal text-accent">
              {column.columnDef.meta.typeLabel}
            </span>
          )}
        </div>
      </div>
      {header.column.getCanResize() && (
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        <DataGridColumnResizer header={header} table={table} label={label} />
      )}
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-use-before-define
const DataGridColumnResizer = React.memo(DataGridColumnResizerImpl, (prev, next) => {
  const prevColumn = prev.header.column;
  const nextColumn = next.header.column;

  if (
    prevColumn.getIsResizing() !== nextColumn.getIsResizing() ||
    prevColumn.getSize() !== nextColumn.getSize()
  ) {
    return false;
  }

  if (prev.label !== next.label) return false;

  return true;
}) as typeof DataGridColumnResizerImpl;

interface DataGridColumnResizerProps<TData, TValue> {
  header: Header<TData, TValue>;
  table: Table<TData>;
  label: string;
}

function DataGridColumnResizerImpl<TData, TValue>({
  header,
  table,
  label
}: DataGridColumnResizerProps<TData, TValue>) {
  // eslint-disable-next-line no-underscore-dangle
  const defaultColumnDef = table._getDefaultColumnDef();

  const onDoubleClick = React.useCallback(() => {
    header.column.resetSize();
  }, [header.column]);

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label} column`}
      aria-valuenow={header.column.getSize()}
      aria-valuemin={defaultColumnDef.minSize}
      aria-valuemax={defaultColumnDef.maxSize}
      tabIndex={0} // eslint-disable-line jsx-a11y/no-noninteractive-tabindex
      className={cn(
        "absolute -end-px top-0 z-50 h-full w-0.5 cursor-ew-resize touch-none bg-border transition-opacity select-none after:absolute after:inset-y-0 after:start-1/2 after:h-full after:w-[18px] after:-translate-x-1/2 after:content-[''] hover:bg-primary focus:bg-primary focus:outline-none",
        header.column.getIsResizing() ? "bg-primary" : "opacity-0 hover:opacity-100"
      )}
      onDoubleClick={onDoubleClick}
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
    />
  );
}
