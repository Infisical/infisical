import * as React from "react";
import type { ColumnPinningState, Row, TableMeta, VisibilityState } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";

import { cn } from "@app/components/v3/utils";

import { useComposedRefs } from "./compose-refs";
import { DataGridCell } from "./data-grid-cell";
import type { CellPosition, Direction, RowHeightValue } from "./data-grid-types";
import {
  flexRender,
  getCellKey,
  getColumnBorderVisibility,
  getColumnPinningStyle,
  getRowHeightValue,
  sanitizeCssId
} from "./data-grid-utils";

interface DataGridRowProps<TData> extends React.ComponentProps<"div"> {
  row: Row<TData>;
  tableMeta: TableMeta<TData>;
  virtualItem: VirtualItem;
  measureElement: (node: Element | null) => void;
  rowMapRef: React.RefObject<Map<number, HTMLDivElement>>;
  rowHeight: RowHeightValue;
  columnVisibility: VisibilityState;
  columnPinning: ColumnPinningState;
  focusedCell: CellPosition | null;
  editingCell: CellPosition | null;
  cellSelectionKeys: Set<string>;
  searchMatchColumns: Set<string> | null;
  activeSearchMatch: CellPosition | null;
  dir: Direction;
  readOnly: boolean;
  stretchColumns: boolean;
  adjustLayout: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-use-before-define
export const DataGridRow = React.memo(DataGridRowImpl, (prev, next) => {
  const prevRowIndex = prev.virtualItem.index;
  const nextRowIndex = next.virtualItem.index;

  // Re-render if row identity changed
  if (prev.row.id !== next.row.id) {
    return false;
  }

  // Re-render if row data (original) reference changed
  if (prev.row.original !== next.row.original) {
    return false;
  }

  // Re-render if virtual position changed (handles transform updates)
  if (prev.virtualItem.start !== next.virtualItem.start) {
    return false;
  }

  // Re-render if focus state changed for this row
  const prevHasFocus = prev.focusedCell?.rowIndex === prevRowIndex;
  const nextHasFocus = next.focusedCell?.rowIndex === nextRowIndex;

  if (prevHasFocus !== nextHasFocus) {
    return false;
  }

  // Re-render if focused column changed within this row
  if (nextHasFocus && prevHasFocus) {
    if (prev.focusedCell?.columnId !== next.focusedCell?.columnId) {
      return false;
    }
  }

  // Re-render if editing state changed for this row
  const prevHasEditing = prev.editingCell?.rowIndex === prevRowIndex;
  const nextHasEditing = next.editingCell?.rowIndex === nextRowIndex;

  if (prevHasEditing !== nextHasEditing) {
    return false;
  }

  // Re-render if editing column changed within this row
  if (nextHasEditing && prevHasEditing) {
    if (prev.editingCell?.columnId !== next.editingCell?.columnId) {
      return false;
    }
  }

  // Re-render if this row's selected cells changed
  // Using stable Set reference that only includes this row's cells
  if (prev.cellSelectionKeys !== next.cellSelectionKeys) {
    return false;
  }

  // Re-render if column visibility changed
  if (prev.columnVisibility !== next.columnVisibility) {
    return false;
  }

  // Re-render if row height changed
  if (prev.rowHeight !== next.rowHeight) {
    return false;
  }

  // Re-render if column pinning state changed
  if (prev.columnPinning !== next.columnPinning) {
    return false;
  }

  // Re-render if readOnly changed
  if (prev.readOnly !== next.readOnly) {
    return false;
  }

  // Re-render if search match columns changed for this row
  if (prev.searchMatchColumns !== next.searchMatchColumns) {
    return false;
  }

  // Re-render if active search match changed for this row
  if (prev.activeSearchMatch?.columnId !== next.activeSearchMatch?.columnId) {
    return false;
  }

  // Re-render if direction changed
  if (prev.dir !== next.dir) {
    return false;
  }

  // Re-render if adjustLayout state changed
  if (prev.adjustLayout !== next.adjustLayout) {
    return false;
  }

  // Re-render if stretchColumns changed
  if (prev.stretchColumns !== next.stretchColumns) {
    return false;
  }

  // Skip re-render - props are equal
  return true;
}) as typeof DataGridRowImpl;

function DataGridRowImpl<TData>({
  row,
  tableMeta,
  virtualItem,
  measureElement,
  rowMapRef,
  rowHeight,
  columnVisibility,
  columnPinning,
  focusedCell,
  editingCell,
  cellSelectionKeys,
  searchMatchColumns,
  activeSearchMatch,
  dir,
  readOnly,
  stretchColumns,
  adjustLayout,
  className,
  style,
  ref,
  ...props
}: DataGridRowProps<TData>) {
  const virtualRowIndex = virtualItem.index;

  const onRowChange = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (typeof virtualRowIndex === "undefined") return;

      if (node) {
        measureElement(node);
        rowMapRef.current?.set(virtualRowIndex, node);
      } else {
        rowMapRef.current?.delete(virtualRowIndex);
      }
    },
    [virtualRowIndex, measureElement, rowMapRef]
  );

  const rowRef = useComposedRefs(ref as React.Ref<HTMLDivElement> | undefined, onRowChange);

  const isRowSelected = row.getIsSelected();

  // Memoize visible cells to avoid recreating cell array on every render
  // Though TanStack returns new Cell wrappers, memoizing the array helps React's reconciliation
  // biome-ignore lint/correctness/useExhaustiveDependencies: columnVisibility and columnPinning are used for calculating the visible cells
  const visibleCells = React.useMemo(
    () => row.getVisibleCells(),
    [row, columnVisibility, columnPinning]
  );

  return (
    <div
      key={row.id}
      role="row"
      aria-rowindex={virtualRowIndex + 2}
      aria-selected={isRowSelected}
      data-index={virtualRowIndex}
      data-slot="grid-row"
      tabIndex={-1}
      {...props}
      ref={rowRef}
      className={cn(
        "absolute flex w-full border-b border-border",
        !adjustLayout && "will-change-transform",
        className
      )}
      style={{
        height: `${getRowHeightValue(rowHeight)}px`,
        ...(adjustLayout
          ? { top: `${virtualItem.start}px` }
          : { transform: `translateY(${virtualItem.start}px)` }),
        ...style
      }}
    >
      {visibleCells.map((cell, colIndex) => {
        const columnId = cell.column.id;

        const isCellFocused =
          focusedCell?.rowIndex === virtualRowIndex && focusedCell?.columnId === columnId;
        const isCellEditing =
          editingCell?.rowIndex === virtualRowIndex && editingCell?.columnId === columnId;
        const isCellSelected =
          cellSelectionKeys?.has(getCellKey(virtualRowIndex, columnId)) ?? false;

        const isSearchMatch = searchMatchColumns?.has(columnId) ?? false;
        const isActiveSearchMatch = activeSearchMatch?.columnId === columnId;
        const isCellDirty = tableMeta?.getIsCellDirty?.(virtualRowIndex, columnId) ?? false;

        const nextCell = visibleCells[colIndex + 1];
        const isLastColumn = colIndex === visibleCells.length - 1;
        const { showEndBorder, showStartBorder } = getColumnBorderVisibility({
          column: cell.column,
          nextColumn: nextCell?.column,
          isLastColumn
        });

        return (
          <div
            key={cell.id}
            role="gridcell"
            aria-colindex={colIndex + 1}
            data-highlighted={isCellFocused ? "" : undefined}
            data-slot="grid-cell"
            tabIndex={-1}
            className={cn({
              grow: stretchColumns && columnId !== "select",
              "border-e": showEndBorder && columnId !== "select",
              "border-s": showStartBorder && columnId !== "select"
            })}
            style={{
              ...getColumnPinningStyle({ column: cell.column, dir }),
              width: `calc(var(--col-${sanitizeCssId(columnId)}-size) * 1px)`
            }}
          >
            {typeof cell.column.columnDef.header === "function" ? (
              <div
                className={cn("size-full px-3 py-1.5", {
                  "bg-primary/10": isRowSelected
                })}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </div>
            ) : (
              <DataGridCell
                cell={cell}
                tableMeta={tableMeta}
                rowIndex={virtualRowIndex}
                columnId={columnId}
                rowHeight={rowHeight}
                isFocused={isCellFocused}
                isEditing={isCellEditing}
                isSelected={isCellSelected}
                isSearchMatch={isSearchMatch}
                isActiveSearchMatch={isActiveSearchMatch}
                isDirty={isCellDirty}
                readOnly={readOnly}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
