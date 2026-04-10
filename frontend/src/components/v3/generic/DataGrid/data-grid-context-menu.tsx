import * as React from "react";
import type { ColumnDef, TableMeta } from "@tanstack/react-table";
import { CircleOffIcon, EraserIcon } from "lucide-react";
import { toast } from "sonner";

import {
  UnstableDropdownMenu as DropdownMenu,
  UnstableDropdownMenuContent as DropdownMenuContent,
  UnstableDropdownMenuItem as DropdownMenuItem,
  UnstableDropdownMenuTrigger as DropdownMenuTrigger
} from "@app/components/v3/generic/Dropdown";

import { useAsRef } from "./hooks/use-as-ref";
import type { CellUpdate, ContextMenuState } from "./data-grid-types";
import { parseCellKey } from "./data-grid-utils";

interface DataGridContextMenuProps<TData> {
  tableMeta: TableMeta<TData>;
  columns: Array<ColumnDef<TData>>;
  contextMenu: ContextMenuState;
}

export function DataGridContextMenu<TData>({
  tableMeta,
  columns,
  contextMenu
}: DataGridContextMenuProps<TData>) {
  const onContextMenuOpenChange = tableMeta?.onContextMenuOpenChange;
  const selectionState = tableMeta?.selectionState;
  const dataGridRef = tableMeta?.dataGridRef;
  const onDataUpdate = tableMeta?.onDataUpdate;
  const onRowsDelete = tableMeta?.onRowsDelete;
  const onCellsCopy = tableMeta?.onCellsCopy;
  const onCellsCut = tableMeta?.onCellsCut;

  if (!contextMenu.open) return null;

  return (
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    <ContextMenu
      tableMeta={tableMeta}
      columns={columns}
      dataGridRef={dataGridRef}
      contextMenu={contextMenu}
      onContextMenuOpenChange={onContextMenuOpenChange}
      selectionState={selectionState}
      onDataUpdate={onDataUpdate}
      onRowsDelete={onRowsDelete}
      onCellsCopy={onCellsCopy}
      onCellsCut={onCellsCut}
    />
  );
}

interface ContextMenuProps<TData>
  extends Pick<
      TableMeta<TData>,
      | "dataGridRef"
      | "onContextMenuOpenChange"
      | "selectionState"
      | "onDataUpdate"
      | "onRowsDelete"
      | "onCellsCopy"
      | "onCellsCut"
      | "readOnly"
    >,
    Required<Pick<TableMeta<TData>, "contextMenu">> {
  tableMeta: TableMeta<TData>;
  columns: Array<ColumnDef<TData>>;
}

// eslint-disable-next-line @typescript-eslint/no-use-before-define
const ContextMenu = React.memo(ContextMenuImpl, (prev, next) => {
  if (prev.contextMenu.open !== next.contextMenu.open) return false;
  if (!next.contextMenu.open) return true;
  if (prev.contextMenu.x !== next.contextMenu.x) return false;
  if (prev.contextMenu.y !== next.contextMenu.y) return false;

  const prevSize = prev.selectionState?.selectedCells?.size ?? 0;
  const nextSize = next.selectionState?.selectedCells?.size ?? 0;
  if (prevSize !== nextSize) return false;

  return true;
}) as typeof ContextMenuImpl;

function ContextMenuImpl<TData>({
  tableMeta,
  columns,
  dataGridRef,
  contextMenu,
  onContextMenuOpenChange,
  selectionState,
  onDataUpdate,
  onRowsDelete,
  onCellsCopy,
  onCellsCut
}: ContextMenuProps<TData>) {
  const propsRef = useAsRef({
    dataGridRef,
    selectionState,
    onDataUpdate,
    onRowsDelete,
    onCellsCopy,
    onCellsCut,
    columns
  });

  const triggerStyle = React.useMemo<React.CSSProperties>(
    () => ({
      position: "fixed",
      left: `${contextMenu.x}px`,
      top: `${contextMenu.y}px`,
      width: "1px",
      height: "1px",
      padding: 0,
      margin: 0,
      border: "none",
      background: "transparent",
      pointerEvents: "none",
      opacity: 0
    }),
    [contextMenu.x, contextMenu.y]
  );

  const onCloseAutoFocus: NonNullable<
    React.ComponentProps<typeof DropdownMenuContent>["onCloseAutoFocus"]
  > = React.useCallback(
    (event) => {
      event.preventDefault();
      propsRef.current.dataGridRef?.current?.focus();
    },
    [propsRef]
  );

  const onClear = React.useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-shadow
    const { selectionState, columns, onDataUpdate } = propsRef.current;

    if (!selectionState?.selectedCells || selectionState.selectedCells.size === 0) return;

    const updates: Array<CellUpdate> = [];

    // eslint-disable-next-line no-restricted-syntax
    for (const cellKey of selectionState.selectedCells) {
      const { rowIndex, columnId } = parseCellKey(cellKey);

      // Get column from columns array
      const column = columns.find((col) => {
        if (col.id) return col.id === columnId;
        if ("accessorKey" in col) return col.accessorKey === columnId;
        return false;
      });
      const cellVariant = column?.meta?.cell?.variant;

      let emptyValue: unknown = "";
      if (cellVariant === "multi-select" || cellVariant === "file") {
        emptyValue = [];
      } else if (cellVariant === "number" || cellVariant === "date") {
        emptyValue = null;
      } else if (cellVariant === "checkbox") {
        emptyValue = false;
      }

      updates.push({ rowIndex, columnId, value: emptyValue });
    }

    onDataUpdate?.(updates);

    toast.success(`${updates.length} cell${updates.length !== 1 ? "s" : ""} cleared`);
  }, [propsRef]);

  const onSetNull = React.useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-shadow
    const { selectionState, onDataUpdate } = propsRef.current;

    if (!selectionState?.selectedCells || selectionState.selectedCells.size === 0) return;

    const updates: Array<CellUpdate> = [];

    // eslint-disable-next-line no-restricted-syntax
    for (const cellKey of selectionState.selectedCells) {
      const { rowIndex, columnId } = parseCellKey(cellKey);
      updates.push({ rowIndex, columnId, value: null });
    }

    onDataUpdate?.(updates);

    toast.success(`${updates.length} cell${updates.length !== 1 ? "s" : ""} set to NULL`);
  }, [propsRef]);

  return (
    <DropdownMenu open={contextMenu.open} onOpenChange={onContextMenuOpenChange}>
      <DropdownMenuTrigger style={triggerStyle} />
      <DropdownMenuContent
        data-grid-popover=""
        align="start"
        className="min-w-[140px] p-0.5 [&_[role=menuitem]]:gap-1.5 [&_[role=menuitem]]:px-2 [&_[role=menuitem]]:py-1 [&_[role=menuitem]]:text-xs [&_svg]:size-3"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DropdownMenuItem onSelect={onClear} isDisabled={tableMeta?.readOnly}>
          <EraserIcon />
          Clear
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSetNull} isDisabled={tableMeta?.readOnly}>
          <CircleOffIcon />
          Set NULL
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
