import * as React from "react";

import { cn } from "@app/components/v3/utils";

import { useComposedRefs } from "./compose-refs";
import type { DataGridCellProps } from "./data-grid-types";
import { getCellKey } from "./data-grid-utils";

interface DataGridCellWrapperProps<TData>
  extends DataGridCellProps<TData>,
    React.ComponentProps<"div"> {}

export function DataGridCellWrapper<TData>({
  tableMeta,
  rowIndex,
  columnId,
  isEditing,
  isFocused,
  isSelected,
  isSearchMatch,
  isActiveSearchMatch,
  isDirty,
  readOnly,
  rowHeight,
  className,
  onClick: onClickProp,
  onKeyDown: onKeyDownProp,
  ref,
  ...props
}: DataGridCellWrapperProps<TData>) {
  const cellMapRef = tableMeta?.cellMapRef;

  const onCellChange = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!cellMapRef?.current) return;

      const cellKey = getCellKey(rowIndex, columnId);

      if (node) {
        cellMapRef.current.set(cellKey, node);
      } else {
        cellMapRef.current.delete(cellKey);
      }
    },
    [rowIndex, columnId, cellMapRef]
  );

  const composedRef = useComposedRefs(ref as React.Ref<HTMLDivElement> | undefined, onCellChange);

  const onClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isEditing) {
        event.preventDefault();
        onClickProp?.(event);
        if (isFocused && !readOnly) {
          tableMeta?.onCellEditingStart?.(rowIndex, columnId);
        } else {
          tableMeta?.onCellClick?.(rowIndex, columnId, event);
        }
      }
    },
    [tableMeta, rowIndex, columnId, isEditing, isFocused, readOnly, onClickProp]
  );

  const onContextMenu = React.useCallback(
    (event: React.MouseEvent) => {
      tableMeta?.onCellContextMenu?.(rowIndex, columnId, event);
    },
    [tableMeta, rowIndex, columnId]
  );

  const onDoubleClick = React.useCallback(
    (event: React.MouseEvent) => {
      if (!isEditing) {
        event.preventDefault();
        tableMeta?.onCellDoubleClick?.(rowIndex, columnId);
      }
    },
    [tableMeta, rowIndex, columnId, isEditing]
  );

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDownProp?.(event);

      if (event.defaultPrevented) return;

      if (
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "Home" ||
        event.key === "End" ||
        event.key === "PageUp" ||
        event.key === "PageDown" ||
        event.key === "Tab"
      ) {
        return;
      }

      if (isFocused && !isEditing && !readOnly) {
        if (event.key === "F2" || event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          tableMeta?.onCellEditingStart?.(rowIndex, columnId);
          return;
        }

        if (event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          tableMeta?.onCellEditingStart?.(rowIndex, columnId);
          return;
        }

        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          tableMeta?.onCellEditingStart?.(rowIndex, columnId);
        }
      }
    },
    [onKeyDownProp, isFocused, isEditing, readOnly, tableMeta, rowIndex, columnId]
  );

  const onMouseDown = React.useCallback(
    (event: React.MouseEvent) => {
      if (!isEditing) {
        tableMeta?.onCellMouseDown?.(rowIndex, columnId, event);
      }
    },
    [tableMeta, rowIndex, columnId, isEditing]
  );

  const onMouseEnter = React.useCallback(() => {
    if (!isEditing) {
      tableMeta?.onCellMouseEnter?.(rowIndex, columnId);
    }
  }, [tableMeta, rowIndex, columnId, isEditing]);

  const onMouseUp = React.useCallback(() => {
    if (!isEditing) {
      tableMeta?.onCellMouseUp?.();
    }
  }, [tableMeta, isEditing]);

  return (
    <div
      role="button"
      data-slot="grid-cell-wrapper"
      data-editing={isEditing ? "" : undefined}
      data-focused={isFocused ? "" : undefined}
      data-selected={isSelected ? "" : undefined}
      tabIndex={isFocused && !isEditing ? 0 : -1}
      {...props}
      ref={composedRef}
      className={cn(
        "size-full px-3 py-1.5 text-start text-sm text-mineshaft-200 outline-none",
        {
          "ring-1 ring-ring ring-inset": isFocused,
          "bg-yellow-900/30": isSearchMatch && !isActiveSearchMatch,
          "bg-orange-900/50": isActiveSearchMatch,
          "bg-yellow-800/20": isDirty && !isSelected && !isSearchMatch && !isActiveSearchMatch,
          "bg-danger/5": isSelected && !isEditing,
          "cursor-default": !isEditing,
          "**:data-[slot=grid-cell-content]:line-clamp-1 **:data-[slot=grid-cell-content]:break-all":
            !isEditing && rowHeight === "short",
          "**:data-[slot=grid-cell-content]:line-clamp-2 **:data-[slot=grid-cell-content]:break-all":
            !isEditing && rowHeight === "medium",
          "**:data-[slot=grid-cell-content]:line-clamp-3 **:data-[slot=grid-cell-content]:break-all":
            !isEditing && rowHeight === "tall",
          "**:data-[slot=grid-cell-content]:line-clamp-4 **:data-[slot=grid-cell-content]:break-all":
            !isEditing && rowHeight === "extra-tall"
        },
        className
      )}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseUp={onMouseUp}
      onKeyDown={onKeyDown}
    />
  );
}
