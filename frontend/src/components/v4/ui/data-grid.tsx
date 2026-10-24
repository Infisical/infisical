import * as React from "react";

import { Button } from "./button";
import { Checkbox } from "./checkbox";
import {
  canEditColumn,
  encodeTsv,
  type GridCell,
  type GridChange,
  type GridColumn,
  type GridSelection,
  type GridValue,
  parseGridValue,
  pasteGrid
} from "./data-grid-model";
import { Icon } from "./icon";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

import styles from "./data.module.css";

export type { GridCell, GridChange, GridColumn, GridSelection, GridValue } from "./data-grid-model";
export interface DataGridProps<Row> {
  rows: readonly Row[];
  columns: readonly GridColumn<Row>[];
  getRowId: (row: Row) => string;
  label: string;
  editable?: boolean;
  onCellsChange?: (
    changes: readonly GridChange<Row>[],
    context: { signal: AbortSignal }
  ) => void | Promise<void>;
  onSelectionChange?: (selection: GridSelection | null) => void;
  dirty?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  height?: number;
  rowHeight?: number;
  rowNumberStart?: number;
  sort?: { columnId: string; direction: "asc" | "desc" };
  onSortChange?: (sort: { columnId: string; direction: "asc" | "desc" }) => void;
  onColumnResize?: (columnId: string, width: number | null) => void;
  onCopy?: (text: string, count: number) => void;
  /** Content of the frame band under the grid: counts, pagination or actions. */
  footer?: React.ReactNode;
  empty?: React.ReactNode;
  /** Shows a + at the end of the header that opens a name, type and nullable form. */
  onAddColumn?: (column: NewGridColumn) => void;
  /** Shows a New row action in the footer band. Return the new row's id to start editing it. */
  onAddRow?: () => string | void;
  /** Called when a new row's first edit is cancelled before anything was committed. */
  onAddRowCancel?: (rowId: string) => void;
}
export const gridColumnTypes = ["text", "int8", "bool", "timestamp", "json"] as const;
export type NewGridColumn = {
  name: string;
  type: (typeof gridColumnTypes)[number];
  nullable: boolean;
};
const AddColumn = ({
  onAdd,
  disabled
}: {
  onAdd: (column: NewGridColumn) => void;
  disabled?: boolean;
}) => {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<NewGridColumn["type"]>("text");
  const [nullable, setNullable] = React.useState(true);
  const nameId = React.useId();
  const reset = () => {
    setName("");
    setType("text");
    setNullable(true);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          iconOnly
          icon="plus"
          aria-label="Add column"
          disabled={disabled}
          className={styles.gridAddColumn}
        />
      </PopoverTrigger>
      <PopoverContent align="end">
        <form
          className={styles.gridAddForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            onAdd({ name: name.trim(), type, nullable });
            setOpen(false);
            reset();
          }}
        >
          <span id={nameId}>Name</span>
          <Input
            aria-labelledby={nameId}
            mono
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <span>Type</span>
          <Select value={type} onValueChange={(value) => setType(value as NewGridColumn["type"])}>
            <SelectTrigger aria-label="Type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {gridColumnTypes.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className={styles.gridAddCheck}>
            <Checkbox
              aria-labelledby={`${nameId}-nullable`}
              checked={nullable}
              onCheckedChange={(value) => setNullable(value === true)}
            />
            <span id={`${nameId}-nullable`}>Nullable</span>
          </span>
          <div className={styles.gridAddActions}>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Add column
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
};
interface Edit {
  cell: GridCell;
  text: string;
  previous: GridValue;
  error: string | null;
}
export function DataGrid<Row>({
  rows,
  columns,
  getRowId,
  label,
  editable = false,
  onCellsChange,
  onSelectionChange,
  dirty,
  height,
  rowHeight = 32,
  rowNumberStart = 1,
  sort,
  onSortChange,
  onColumnResize,
  onCopy,
  footer,
  empty = "No rows",
  onAddColumn,
  onAddRow,
  onAddRowCancel
}: DataGridProps<Row>) {
  const added = React.useRef<{ id: string; started: boolean; committed: boolean } | null>(null);
  const [selection, setSelection] = React.useState<GridSelection | null>(null);
  const [edit, setEdit] = React.useState<Edit | null>(null);
  const [status, setStatus] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [widths, setWidths] = React.useState<Readonly<Record<string, number>>>({});
  const [scrollTop, setScrollTop] = React.useState(0);
  const history = React.useRef<(readonly GridChange<Row>[])[]>([]);
  const generation = React.useRef(0);
  const pending = React.useRef<AbortController | null>(null);
  const resizeCleanup = React.useRef<(() => void) | null>(null);
  const grid = React.useRef<HTMLDivElement>(null);
  const input = React.useRef<HTMLTextAreaElement>(null);
  const uid = React.useId();
  const [contentRowHeight, setContentRowHeight] = React.useState(rowHeight);
  const effectiveRowHeight = Math.max(rowHeight, contentRowHeight);
  React.useLayoutEffect(() => {
    const container = grid.current;
    const header = container?.querySelector<HTMLElement>('[aria-rowindex="1"]');
    if (!container || !header) return;
    const measure = () => {
      const cell = container.querySelector<HTMLElement>('[role="gridcell"]');
      if (!cell) return;
      const style = getComputedStyle(cell);
      const lineHeight = Number.parseFloat(style.lineHeight);
      const inset =
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom) +
        Number.parseFloat(style.borderTopWidth) +
        Number.parseFloat(style.borderBottomWidth);
      if (Number.isFinite(lineHeight + inset)) setContentRowHeight(Math.ceil(lineHeight + inset));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, [rows.length, columns]);
  React.useEffect(
    () => () => {
      generation.current += 1;
      pending.current?.abort();
      resizeCleanup.current?.();
    },
    []
  );
  React.useEffect(() => {
    onSelectionChange?.(selection);
  }, [selection, onSelectionChange]);
  const rowIndex = selection
    ? rows.findIndex((row) => getRowId(row) === selection.active.rowId)
    : -1;
  const colIndex = selection
    ? columns.findIndex((column) => column.id === selection.active.columnId)
    : -1;
  React.useLayoutEffect(() => {
    const container = grid.current;
    const active = container?.querySelector<HTMLElement>("[data-active]");
    if (!container || !active) return;
    const bounds = container.getBoundingClientRect();
    const cell = active.getBoundingClientRect();
    const gutterWidth =
      container.querySelector<HTMLElement>('[role="rowheader"]')?.getBoundingClientRect().width ??
      0;
    const left = bounds.left + container.clientLeft + gutterWidth;
    const right = bounds.left + container.clientLeft + container.clientWidth;
    const headerBottom =
      container.querySelector<HTMLElement>('[aria-rowindex="1"]')?.getBoundingClientRect().bottom ??
      bounds.top;
    const bottom = bounds.top + container.clientTop + container.clientHeight;
    if (cell.top < headerBottom) container.scrollTop -= headerBottom - cell.top;
    else if (cell.bottom > bottom) container.scrollTop += cell.bottom - bottom;
    if (cell.left < left) container.scrollLeft -= left - cell.left;
    else if (cell.right > right) container.scrollLeft += cell.right - right;
  }, [rowIndex, colIndex, columns, effectiveRowHeight]);
  const anchorRow = selection
    ? rows.findIndex((row) => getRowId(row) === selection.anchor.rowId)
    : -1;
  const anchorCol = selection
    ? columns.findIndex((column) => column.id === selection.anchor.columnId)
    : -1;
  const range =
    rowIndex >= 0 && colIndex >= 0
      ? {
          r0: Math.min(rowIndex, anchorRow < 0 ? rowIndex : anchorRow),
          r1: Math.max(rowIndex, anchorRow),
          c0: Math.min(colIndex, anchorCol < 0 ? colIndex : anchorCol),
          c1: Math.max(colIndex, anchorCol)
        }
      : null;
  const cellId = (r: number, c: number) => `${uid}-${r}-${c}`;
  const focusGrid = () => grid.current?.focus({ preventScroll: true });
  const select = (r: number, c: number, extend = false) => {
    const row = rows[Math.max(0, Math.min(rows.length - 1, r))];
    const column = columns[Math.max(0, Math.min(columns.length - 1, c))];
    if (!row || !column || busy) return;
    const cell = { rowId: getRowId(row), columnId: column.id };
    setSelection((old) => ({ active: cell, anchor: extend && old ? old.anchor : cell }));
  };
  const change = async (changes: readonly GridChange<Row>[], undo = false): Promise<boolean> => {
    if (!changes.length) return true;
    if (!onCellsChange || busy || pending.current) return false;
    const controller = new AbortController();
    pending.current = controller;
    generation.current += 1;
    const turn = generation.current;
    setBusy(true);
    setStatus("Applying changes");
    try {
      await onCellsChange(changes, { signal: controller.signal });
      if (generation.current !== turn || controller.signal.aborted) return false;
      if (!undo) history.current.push(changes);
      setStatus(`${changes.length} ${changes.length === 1 ? "cell changed" : "cells changed"}`);
      return true;
    } catch {
      if (generation.current === turn)
        setStatus("Changes were not applied. Your draft is kept. Retry or cancel.");
      return false;
    } finally {
      if (generation.current === turn) {
        setBusy(false);
        pending.current = null;
      }
    }
  };
  const startEdit = (r: number, c: number, text?: string) => {
    const row = rows[r];
    const column = columns[c];
    if (!row || !column || !editable || !canEditColumn(column) || busy) return;
    const cell = { rowId: getRowId(row), columnId: column.id };
    const previous = column.getValue(row);
    setEdit({ cell, text: text ?? previous ?? "", previous, error: null });
    setSelection({ active: cell, anchor: cell });
  };
  React.useLayoutEffect(() => {
    const field = input.current;
    if (!edit || !field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, [edit?.cell.rowId, edit?.cell.columnId]);
  React.useEffect(() => {
    const active = document.activeElement;
    if (!busy && edit && input.current && (!active || active === document.body))
      input.current.focus();
  }, [busy]);
  React.useEffect(() => {
    if (
      !edit ||
      (rows.some((row) => getRowId(row) === edit.cell.rowId) &&
        columns.some((column) => column.id === edit.cell.columnId))
    )
      return;
    generation.current += 1;
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
    setEdit(null);
    setStatus("The edited cell is no longer available. The draft was not applied.");
  }, [rows, columns, getRowId, edit?.cell.rowId, edit?.cell.columnId]);
  const cancelEdit = () => {
    const fresh = added.current;
    if (fresh && edit?.cell.rowId === fresh.id) {
      added.current = null;
      onAddRowCancel?.(fresh.id);
    }
    setEdit(null);
    focusGrid();
  };
  React.useEffect(() => {
    const fresh = added.current;
    if (!fresh || fresh.started) return;
    const r = rows.findIndex((row) => getRowId(row) === fresh.id);
    const c = columns.findIndex((column) => canEditColumn(column));
    if (r < 0 || c < 0) return;
    fresh.started = true;
    startEdit(r, c);
  });
  const commit = async (dr = 0, dc = 0) => {
    if (!edit || busy) return;
    const row = rows.find((item) => getRowId(item) === edit.cell.rowId);
    const column = columns.find((item) => item.id === edit.cell.columnId);
    if (!row || !column) {
      setEdit(null);
      setStatus("The edited cell is no longer available.");
      return;
    }
    if (!editable || !onCellsChange || !canEditColumn(column)) {
      setEdit(null);
      setStatus("The cell is no longer editable. The draft was not applied.");
      focusGrid();
      return;
    }
    if (column.getValue(row) !== edit.previous) {
      const error =
        "The value changed while you were editing. Cancel and review the current value before trying again.";
      setEdit({ ...edit, error });
      setStatus(error);
      return;
    }
    const parsed = parseGridValue(column, edit.text, row);
    if ("error" in parsed) {
      setEdit({ ...edit, error: parsed.error });
      return;
    }
    const ok = await change([{ ...edit.cell, row, previous: edit.previous, value: parsed.value }]);
    if (ok) {
      if (added.current?.id === edit.cell.rowId) added.current = null;
      setEdit(null);
      focusGrid();
      if (dr || dc) select(rowIndex + dr, colIndex + dc);
    }
  };
  const selectedChanges = (value: GridValue): readonly GridChange<Row>[] | null => {
    if (!range) return [];
    const changes: GridChange<Row>[] = [];
    for (let r = range.r0; r <= range.r1; r += 1)
      for (let c = range.c0; c <= range.c1; c += 1) {
        const row = rows[r];
        const column = columns[c];
        if (!row || !column || !canEditColumn(column)) {
          setStatus("The selected range includes read-only or protected cells.");
          return null;
        }
        const parsed = parseGridValue(column, value === null && !column.nullable ? "" : value, row);
        if ("error" in parsed) {
          setStatus(parsed.error);
          return null;
        }
        changes.push({
          rowId: getRowId(row),
          columnId: column.id,
          row,
          previous: column.getValue(row),
          value: parsed.value
        });
      }
    return changes;
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || busy || edit) return;
    const navigation =
      event.key.startsWith("Arrow") || ["Home", "End", "PageUp", "PageDown"].includes(event.key);
    if ((rowIndex < 0 || colIndex < 0) && navigation) {
      event.preventDefault();
      select(0, 0);
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    const r = rowIndex < 0 ? 0 : rowIndex;
    const c = colIndex < 0 ? 0 : colIndex;
    let next: [number, number] | null = null;
    if (event.key === "ArrowDown") next = [mod ? rows.length - 1 : r + 1, c];
    if (event.key === "ArrowUp") next = [mod ? 0 : r - 1, c];
    if (event.key === "ArrowRight") next = [r, mod ? columns.length - 1 : c + 1];
    if (event.key === "ArrowLeft") next = [r, mod ? 0 : c - 1];
    if (event.key === "Home") next = [mod ? 0 : r, 0];
    if (event.key === "End") next = [mod ? rows.length - 1 : r, columns.length - 1];
    if (event.key === "PageDown")
      next = [r + Math.max(1, Math.floor((height ?? 320) / effectiveRowHeight) - 1), c];
    if (event.key === "PageUp")
      next = [r - Math.max(1, Math.floor((height ?? 320) / effectiveRowHeight) - 1), c];
    if (next) {
      event.preventDefault();
      select(...next, event.shiftKey);
    } else if (mod && event.key.toLowerCase() === "a") {
      event.preventDefault();
      const first = rows[0];
      const last = rows[rows.length - 1];
      const fc = columns[0];
      const lc = columns[columns.length - 1];
      if (first && last && fc && lc)
        setSelection({
          anchor: { rowId: getRowId(first), columnId: fc.id },
          active: { rowId: getRowId(last), columnId: lc.id }
        });
    } else if (mod && event.key.toLowerCase() === "z" && editable) {
      event.preventDefault();
      const last = history.current[history.current.length - 1];
      if (
        last &&
        last.some((cell) => {
          const row = rows.find((item) => getRowId(item) === cell.rowId);
          const column = columns.find((item) => item.id === cell.columnId);
          return !row || !column || !canEditColumn(column) || column.getValue(row) !== cell.value;
        })
      ) {
        setStatus("Cannot undo because the affected cells changed or are no longer editable.");
        return;
      }
      if (last)
        change(
          last.map((cell) => ({ ...cell, previous: cell.value, value: cell.previous })),
          true
        ).then((ok) => {
          if (ok) history.current.pop();
        });
    } else if (event.key === " " && selection && (event.shiftKey || mod)) {
      event.preventDefault();
      const first = rows[0];
      const last = rows[rows.length - 1];
      const fc = columns[0];
      const lc = columns[columns.length - 1];
      if (event.shiftKey && fc && lc)
        setSelection({
          anchor: { rowId: selection.active.rowId, columnId: fc.id },
          active: { rowId: selection.active.rowId, columnId: lc.id }
        });
      else if (mod && first && last)
        setSelection({
          anchor: { rowId: getRowId(first), columnId: selection.active.columnId },
          active: { rowId: getRowId(last), columnId: selection.active.columnId }
        });
    } else if (event.key === "Escape") {
      event.preventDefault();
      setSelection((old) => old && { active: old.active, anchor: old.active });
    } else if (["Enter", "F2"].includes(event.key)) {
      event.preventDefault();
      startEdit(r, c);
    } else if ((event.key === "Delete" || event.key === "Backspace") && editable) {
      event.preventDefault();
      const changes = selectedChanges(event.altKey ? "" : null);
      if (changes) change(changes);
    } else if (event.key.length === 1 && !event.nativeEvent.isComposing && !mod && !event.altKey) {
      event.preventDefault();
      startEdit(r, c, event.key);
    }
  };
  const copy = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !range) return;
    const values: GridValue[][] = [];
    for (let r = range.r0; r <= range.r1; r += 1) {
      const row = rows[r];
      if (!row) return;
      const line: GridValue[] = [];
      for (let c = range.c0; c <= range.c1; c += 1) {
        const column = columns[c];
        if (!column) return;
        if (column.sensitive) {
          event.preventDefault();
          setStatus("Protected cells cannot be copied from the grid.");
          return;
        }
        line.push(column.getValue(row));
      }
      values.push(line);
    }
    event.preventDefault();
    const text = encodeTsv(values);
    event.clipboardData.setData("text/plain", text);
    const count = values.reduce((sum, line) => sum + line.length, 0);
    setStatus(`Copied ${count} cells`);
    onCopy?.(text, count);
  };
  const paste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !selection || !editable || busy) return;
    event.preventDefault();
    const result = pasteGrid({
      rows,
      columns,
      getRowId,
      active: selection.active,
      text: event.clipboardData.getData("text/plain")
    });
    if ("error" in result) setStatus(result.error);
    else change(result.changes);
  };
  const resize = (id: string, width: number | null) => {
    setWidths((old) => {
      const next = { ...old };
      if (width === null) delete next[id];
      else next[id] = width;
      return next;
    });
    onColumnResize?.(id, width);
  };
  const effectiveWidths = new Map(
    columns.map((column) => {
      const autoWidth = Math.max(
        column.minWidth ?? 64,
        Math.min(
          column.maxWidth ?? 240,
          Math.max(
            column.header.length,
            ...rows
              .slice(0, 200)
              .map((row) => (column.sensitive ? 8 : (column.getValue(row)?.length ?? 4)))
          ) *
            8 +
            32
        )
      );
      return [column.id, widths[column.id] ?? column.width ?? autoWidth];
    })
  );
  const effectiveWidth = (column: GridColumn<Row>) => effectiveWidths.get(column.id) ?? 64;
  const template = `max-content ${columns.map((column) => `${effectiveWidth(column)}px`).join(" ")}${onAddColumn ? " var(--v4-size-control-sm)" : ""}`;
  const start = height ? Math.max(0, Math.floor(scrollTop / effectiveRowHeight) - 5) : 0;
  const end = height
    ? Math.min(rows.length, start + Math.ceil(height / effectiveRowHeight) + 10)
    : rows.length;
  const visible = rows
    .map((_, i) => i)
    .filter(
      (i) =>
        (i >= start && i < end) ||
        i === rowIndex ||
        (edit && getRowId(rows[i]!) === edit.cell.rowId)
    );
  const renderRow = (r: number) => {
    const row = rows[r];
    if (!row) return null;
    return (
      <div
        role="row"
        aria-rowindex={r + 2}
        key={getRowId(row)}
        data-last={r === rows.length - 1 || undefined}
        className={styles.gridRow}
        style={{
          gridTemplateColumns: template,
          height: effectiveRowHeight,
          ...(height ? { position: "absolute", top: r * effectiveRowHeight, minWidth: "100%" } : {})
        }}
      >
        <div
          role="rowheader"
          className={styles.gutter}
          data-selected={(!!range && r >= range.r0 && r <= range.r1) || undefined}
        >
          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              const first = columns[0];
              const last = columns[columns.length - 1];
              if (first && last)
                setSelection({
                  anchor: { rowId: getRowId(row), columnId: first.id },
                  active: { rowId: getRowId(row), columnId: last.id }
                });
            }}
          >
            {r + rowNumberStart}
          </button>
        </div>
        {columns.map((column, c) => {
          const active = rowIndex === r && colIndex === c;
          const selected =
            !!range && r >= range.r0 && r <= range.r1 && c >= range.c0 && c <= range.c1;
          const editing =
            editable &&
            canEditColumn(column) &&
            edit?.cell.rowId === getRowId(row) &&
            edit.cell.columnId === column.id;
          const value = column.sensitive ? null : column.getValue(row);
          const shown = column.sensitive
            ? "Protected value"
            : (column.format?.(value, row) ?? value);
          const text = shown ?? "NULL";
          const rangeEdge = selected
            ? [
                r === range.r0 && "inset 0 1px 0 var(--v4-accent-line)",
                r === range.r1 && "inset 0 -1px 0 var(--v4-accent-line)",
                c === range.c0 && "inset 1px 0 0 var(--v4-accent-line)",
                c === range.c1 && "inset -1px 0 0 var(--v4-accent-line)"
              ]
                .filter(Boolean)
                .join(", ")
            : undefined;
          return (
            <div
              key={column.id}
              id={cellId(r, c)}
              role="gridcell"
              tabIndex={-1}
              aria-colindex={c + 2}
              aria-selected={selected}
              aria-readonly={!editable || !canEditColumn(column)}
              data-active={active || undefined}
              data-selected={selected || undefined}
              data-dirty={
                (dirty?.[getRowId(row)] &&
                  Object.prototype.hasOwnProperty.call(dirty[getRowId(row)] ?? {}, column.id)) ||
                undefined
              }
              className={styles.gridCell}
              style={{ textAlign: column.align, boxShadow: rangeEdge || undefined }}
              title={column.sensitive ? undefined : text}
              onMouseDown={(event) => {
                if (editing || busy) return;
                event.preventDefault();
                if (edit) {
                  setStatus("Finish or cancel the current edit first.");
                  return;
                }
                select(r, c, event.shiftKey);
                focusGrid();
              }}
              onDoubleClick={() => startEdit(r, c)}
              onMouseEnter={(event) => {
                if (event.buttons === 1 && !edit && !busy) select(r, c, true);
              }}
            >
              {editing ? (
                <textarea
                  ref={input}
                  aria-label={`${column.header}, row ${r + rowNumberStart}`}
                  aria-invalid={!!edit.error}
                  aria-describedby={edit.error ? `${uid}-error` : undefined}
                  value={edit.text}
                  disabled={busy}
                  onChange={(event) => setEdit({ ...edit, text: event.target.value, error: null })}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing) return;
                    if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      cancelEdit();
                    } else if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      commit(1, 0);
                    } else if (event.key === "Tab") {
                      event.preventDefault();
                      commit(0, event.shiftKey ? -1 : 1);
                    }
                  }}
                />
              ) : shown === null || shown === undefined ? (
                <span className={styles.gridNull}>NULL</span>
              ) : (
                text
              )}
            </div>
          );
        })}
      </div>
    );
  };
  return (
    <div
      className={styles.gridShell}
      data-footer={footer || onAddRow ? "" : undefined}
      role="group"
      aria-label={`${label} workspace`}
      data-v4-escape-owner={edit ? "" : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape" && edit && !busy) {
          event.preventDefault();
          event.stopPropagation();
          cancelEdit();
        }
      }}
    >
      <div
        ref={grid}
        role="grid"
        tabIndex={0}
        aria-label={label}
        aria-rowcount={rows.length + 1}
        aria-colcount={columns.length + 1}
        aria-multiselectable
        aria-readonly={!editable}
        aria-busy={busy}
        aria-activedescendant={
          rowIndex >= 0 && colIndex >= 0 && !edit ? cellId(rowIndex, colIndex) : undefined
        }
        data-scroll-fade="both"
        className={styles.gridScroll}
        style={{ maxHeight: height }}
        onKeyDown={onKeyDown}
        onCopy={copy}
        onPaste={paste}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div
          role="row"
          aria-rowindex={1}
          className={styles.gridHead}
          style={{ gridTemplateColumns: template }}
        >
          <div role="columnheader" className={styles.gutter}>
            #
          </div>
          {columns.map((column) => (
            <div
              role="columnheader"
              key={column.id}
              aria-colindex={columns.indexOf(column) + 2}
              aria-sort={
                sort?.columnId === column.id
                  ? sort.direction === "asc"
                    ? "ascending"
                    : "descending"
                  : undefined
              }
              className={styles.gridHeader}
              data-selected={
                (!!range &&
                  columns.indexOf(column) >= range.c0 &&
                  columns.indexOf(column) <= range.c1) ||
                undefined
              }
            >
              <span
                className={styles.gridHeaderLabel}
                title={column.type ? `${column.header}, ${column.type}` : undefined}
              >
                <span>
                  {column.primaryKey && (
                    <Icon name="key" size={12} label="Primary key" className={styles.gridKey} />
                  )}
                  {column.header}
                </span>
                {effectiveWidth(column) >= 160 && <small>{column.type}</small>}
              </span>
              {onSortChange && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  iconOnly
                  aria-label={`Sort ${column.header}`}
                  data-active={sort?.columnId === column.id || undefined}
                  className={styles.gridSort}
                  disabled={busy}
                  onClick={() =>
                    onSortChange({
                      columnId: column.id,
                      direction:
                        sort?.columnId === column.id && sort.direction === "asc" ? "desc" : "asc"
                    })
                  }
                >
                  <Icon
                    name={
                      sort?.columnId === column.id && sort.direction === "desc"
                        ? "arrow-down"
                        : "arrow-up"
                    }
                  />
                </Button>
              )}
              <span
                role="slider"
                tabIndex={0}
                aria-orientation="horizontal"
                aria-label={`Resize ${column.header}`}
                aria-valuemin={column.minWidth ?? 64}
                aria-valuemax={column.maxWidth ?? 800}
                aria-valuenow={effectiveWidth(column)}
                className={styles.resize}
                onKeyDown={(event) => {
                  const w = effectiveWidth(column);
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault();
                    resize(
                      column.id,
                      Math.max(
                        column.minWidth ?? 64,
                        Math.min(column.maxWidth ?? 800, w + (event.key === "ArrowLeft" ? -8 : 8))
                      )
                    );
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    resize(column.id, null);
                  }
                }}
                onDoubleClick={() => resize(column.id, null)}
                onPointerDown={(event) => {
                  event.preventDefault();
                  resizeCleanup.current?.();
                  const left = event.clientX;
                  const width = effectiveWidth(column);
                  const move = (e: PointerEvent) =>
                    resize(
                      column.id,
                      Math.max(
                        column.minWidth ?? 64,
                        Math.min(column.maxWidth ?? 800, width + e.clientX - left)
                      )
                    );
                  const stop = () => {
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", stop);
                    window.removeEventListener("pointercancel", stop);
                    resizeCleanup.current = null;
                  };
                  resizeCleanup.current = stop;
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", stop);
                  window.addEventListener("pointercancel", stop);
                }}
              />
            </div>
          ))}
          {onAddColumn && (
            <div role="columnheader" className={styles.gridAddHeader}>
              <AddColumn onAdd={onAddColumn} disabled={busy || !!edit} />
            </div>
          )}
        </div>
        <div
          role="rowgroup"
          style={
            height ? { position: "relative", height: rows.length * effectiveRowHeight } : undefined
          }
        >
          {visible.map(renderRow)}
        </div>
        {!rows.length && <div className={styles.empty}>{empty}</div>}
      </div>
      {edit && (
        <div className={styles.actions}>
          <Button type="button" variant="outline" disabled={busy} onClick={cancelEdit}>
            Cancel edit
          </Button>
          <Button type="button" disabled={busy} onClick={() => commit()}>
            Apply cell
          </Button>
          <span id={`${uid}-error`} role="alert">
            {edit.error}
          </span>
        </div>
      )}
      <div role="status" className={styles.status}>
        {status || (
          <>
            {rows.length} {rows.length === 1 ? "row" : "rows"}.
            {rows.length > 0 && (
              <>
                {" "}
                Select a cell.{" "}
                {editable &&
                  onCellsChange &&
                  "Enter edits, Shift+Enter adds a line and Escape cancels."}
              </>
            )}
          </>
        )}
      </div>
      {(footer || onAddRow) && (
        <div className={styles.gridFooter}>
          {onAddRow && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              icon="plus"
              disabled={busy || !!edit}
              onClick={() => {
                const id = onAddRow();
                if (id) added.current = { id, started: false, committed: false };
              }}
            >
              New row
            </Button>
          )}
          {footer}
        </div>
      )}
    </div>
  );
}
