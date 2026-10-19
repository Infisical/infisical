import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { Button } from "./button";
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
  footer?: React.ReactNode;
  empty?: React.ReactNode;
}
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
  empty = "No rows"
}: DataGridProps<Row>) {
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
  const template = `max-content ${columns.map((column) => `${effectiveWidth(column)}px`).join(" ")}`;
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
                      setEdit(null);
                      focusGrid();
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
      role="group"
      aria-label={`${label} workspace`}
      data-v4-escape-owner={edit ? "" : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape" && edit && !busy) {
          event.preventDefault();
          event.stopPropagation();
          setEdit(null);
          focusGrid();
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
                  {column.primaryKey ? "⌑ " : ""}
                  {column.header}
                </span>
                {effectiveWidth(column) >= 160 && <small>{column.type}</small>}
              </span>
              {onSortChange && (
                <button
                  type="button"
                  aria-label={`Sort ${column.header}`}
                  data-active={sort?.columnId === column.id || undefined}
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
                    icon={
                      sort?.columnId !== column.id
                        ? ArrowUpDown
                        : sort.direction === "asc"
                          ? ArrowUp
                          : ArrowDown
                    }
                    strokeWidth={2}
                  />
                </button>
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
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setEdit(null);
              focusGrid();
            }}
          >
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
      {footer && <div className={styles.status}>{footer}</div>}
    </div>
  );
}
