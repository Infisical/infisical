import * as React from "react";

import { cn } from "../lib/utils";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Icon } from "./icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions
} from "./table";

import styles from "./data.module.css";
import frame from "./frame.module.css";

export interface DataTableColumn<Row> {
  id: string;
  header: string;
  render: (row: Row, index: number) => React.ReactNode;
  text?: (row: Row) => string;
  primary?: boolean;
  sortable?: boolean;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  grow?: boolean;
  align?: "start" | "end" | "center";
  actions?: boolean;
  pin?: boolean;
  hideHeader?: boolean;
}
export interface DataTableProps<Row> {
  label: string;
  rows: readonly Row[];
  columns: readonly DataTableColumn<Row>[];
  getRowId: (row: Row) => string;
  rowLabel: (row: Row) => string;
  variant?: "basic" | "striped" | "bordered";
  selectable?: boolean;
  selectedIds?: readonly string[];
  defaultSelectedIds?: readonly string[];
  onSelectionChange?: (ids: string[]) => void;
  isSelectable?: (row: Row) => boolean;
  sort?: { columnId: string; direction: "asc" | "desc" };
  onSortChange?: (sort: { columnId: string; direction: "asc" | "desc" }) => void;
  empty?: React.ReactNode;
  height?: number;
  virtual?: boolean;
  rowHeight?: number;
  loadMore?: { label: string; onClick: () => void; loading?: boolean };
  end?: React.ReactNode;
  footer?: React.ReactNode;
}
export function DataTable<Row>({
  label,
  rows,
  columns,
  getRowId,
  rowLabel,
  variant = "basic",
  selectable,
  selectedIds,
  defaultSelectedIds = [],
  onSelectionChange,
  isSelectable = () => true,
  sort,
  onSortChange,
  empty = "No rows",
  height,
  virtual = false,
  rowHeight,
  loadMore,
  end,
  footer
}: DataTableProps<Row>) {
  const [ownSelected, setOwnSelected] = React.useState<readonly string[]>(defaultSelectedIds);
  const [top, setTop] = React.useState(0);
  const scroll = React.useRef<HTMLDivElement>(null);
  const [landing, setLanding] = React.useState<number | null>(null);
  const [focusRow, setFocusRow] = React.useState<number | null>(null);
  const focusPending = React.useRef(false);
  const [tokenRowHeight, setTokenRowHeight] = React.useState<number>();
  const requestedRowHeight = rowHeight ?? tokenRowHeight;
  const [measuredRow, setMeasuredRow] = React.useState({
    requested: requestedRowHeight,
    height: requestedRowHeight
  });
  const effectiveRowHeight =
    measuredRow.requested === requestedRowHeight ? measuredRow.height : requestedRowHeight;
  const selected = selectedIds ?? ownSelected;
  const eligible = rows.filter(isSelectable).map(getRowId);
  const checked = eligible.filter((id) => selected.includes(id)).length;
  const update = (next: string[]) => {
    if (selectedIds === undefined) setOwnSelected(next);
    onSelectionChange?.(next);
  };
  const windowed = Boolean(height && virtual);
  const windowSize =
    height && effectiveRowHeight ? Math.ceil(height / effectiveRowHeight) + 8 : rows.length;
  const start =
    windowed && effectiveRowHeight
      ? Math.max(0, Math.min(Math.floor(top / effectiveRowHeight) - 4, rows.length - windowSize))
      : 0;
  let stop = rows.length;
  if (windowed) stop = effectiveRowHeight ? Math.min(rows.length, start + windowSize) : 0;
  React.useLayoutEffect(() => {
    if (rowHeight !== undefined || !scroll.current) return;
    const token = parseFloat(getComputedStyle(scroll.current).getPropertyValue("--v4-size-row"));
    if (token > 0) setTokenRowHeight(token);
  }, [rowHeight]);
  React.useLayoutEffect(() => {
    const container = scroll.current;
    if (!container || !windowed || !requestedRowHeight || !effectiveRowHeight) return;
    const visibleRows = Array.from(
      container.querySelectorAll<HTMLElement>("tbody tr[aria-rowindex]")
    );
    const measure = () => {
      const actual = Math.max(
        requestedRowHeight,
        ...visibleRows.map((row) => row.getBoundingClientRect().height)
      );
      if (actual > effectiveRowHeight + 0.5)
        setMeasuredRow({ requested: requestedRowHeight, height: actual });
    };
    measure();
    const observer = new ResizeObserver(measure);
    visibleRows.forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [requestedRowHeight, effectiveRowHeight, windowed, start, stop, rows, columns]);
  React.useLayoutEffect(() => {
    const container = scroll.current;
    if (
      landing === null ||
      !container ||
      !effectiveRowHeight ||
      loadMore?.loading ||
      rows.length <= landing
    )
      return;
    container.scrollTop = Math.max(0, (landing - 1) * effectiveRowHeight);
    setTop(container.scrollTop);
    focusPending.current = true;
    setFocusRow(landing);
    setLanding(null);
  }, [landing, loadMore?.loading, rows.length, effectiveRowHeight]);
  React.useLayoutEffect(() => {
    if (!focusPending.current || focusRow === null) return;
    const row = scroll.current?.querySelector<HTMLElement>(
      `tbody tr[aria-rowindex="${focusRow + 2}"]`
    );
    if (!row) return;
    focusPending.current = false;
    row.focus({ preventScroll: true });
  }, [focusRow, start]);
  const span = columns.length + (selectable ? 1 : 0);
  const hasGrowingColumn = columns.some((column) => column.grow && column.width === undefined);
  const columnStyle = (column: DataTableColumn<Row>): React.CSSProperties => ({
    width: column.width ?? (hasGrowingColumn && !column.grow ? "1%" : undefined),
    minWidth: column.width ?? (column.actions ? undefined : (column.minWidth ?? 64)),
    maxWidth: column.maxWidth,
    textAlign: column.align
  });
  const tableStyle: React.CSSProperties & { "--v4-table-row-height"?: string } = {
    maxHeight: height,
    "--v4-table-row-height": effectiveRowHeight ? `${effectiveRowHeight}px` : undefined
  };
  const more = loadMore ? (
    <Button
      type="button"
      variant="outline"
      loading={Boolean(loadMore.loading)}
      onClick={() => {
        setLanding(rows.length);
        loadMore.onClick();
      }}
    >
      {loadMore.label}
    </Button>
  ) : (
    rows.length > 0 && end
  );
  const scrollFrame = (
    <div
      ref={scroll}
      data-scroll-fade="x"
      className={cn(frame.frame, styles.tableScroll)}
      data-virtual={windowed || undefined}
      style={tableStyle}
      onScroll={(event) => setTop(event.currentTarget.scrollTop)}
    >
      <Table aria-label={label} aria-rowcount={rows.length + 1} data-variant={variant}>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className={styles.tableCheck}>
                <Checkbox
                  aria-label={`Select all available rows in ${label}`}
                  disabled={!eligible.length}
                  checked={
                    checked > 0 && checked < eligible.length
                      ? "indeterminate"
                      : eligible.length > 0 && checked === eligible.length
                  }
                  onCheckedChange={() =>
                    update(
                      checked === eligible.length
                        ? selected.filter((id) => !eligible.includes(id))
                        : [...new Set([...selected, ...eligible])]
                    )
                  }
                />
              </TableHead>
            )}
            {columns.map((column) => (
              <TableHead
                key={column.id}
                scope="col"
                style={columnStyle(column)}
                data-actions={column.actions || undefined}
                data-pin={column.pin ?? column.actions}
                aria-sort={
                  sort?.columnId === column.id
                    ? sort.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                {column.sortable && onSortChange ? (
                  <button
                    type="button"
                    className={styles.tableSort}
                    data-active={sort?.columnId === column.id || undefined}
                    onClick={() =>
                      onSortChange({
                        columnId: column.id,
                        direction:
                          sort?.columnId === column.id && sort.direction === "asc" ? "desc" : "asc"
                      })
                    }
                  >
                    {column.header}
                    <Icon
                      name={
                        sort?.columnId === column.id && sort.direction === "desc"
                          ? "arrow-down"
                          : "arrow-up"
                      }
                    />
                  </button>
                ) : (
                  <span className={column.hideHeader || column.actions ? styles.sr : undefined}>
                    {column.header}
                  </span>
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {start > 0 && (
            <TableRow aria-hidden data-spacer>
              <TableCell
                colSpan={span}
                style={{ height: start * (effectiveRowHeight ?? 0), padding: 0 }}
              />
            </TableRow>
          )}
          {rows.slice(start, stop).map((row, i) => (
            <TableRow
              key={getRowId(row)}
              aria-rowindex={start + i + 2}
              tabIndex={start + i === focusRow ? -1 : undefined}
              onBlur={start + i === focusRow ? () => setFocusRow(null) : undefined}
              data-state={selected.includes(getRowId(row)) ? "selected" : undefined}
              style={{ height: effectiveRowHeight }}
            >
              {selectable && (
                <TableCell className={styles.tableCheck}>
                  <div className={styles.tableSelection}>
                    <Checkbox
                      aria-label={`Select ${rowLabel(row)}`}
                      checked={selected.includes(getRowId(row))}
                      disabled={!isSelectable(row)}
                      onCheckedChange={() =>
                        update(
                          selected.includes(getRowId(row))
                            ? selected.filter((id) => id !== getRowId(row))
                            : [...selected, getRowId(row)]
                        )
                      }
                    />
                  </div>
                </TableCell>
              )}
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  style={columnStyle(column)}
                  data-actions={column.actions || undefined}
                  data-pin={column.pin ?? column.actions}
                >
                  {column.actions ? (
                    <TableRowActions style={{ maxWidth: column.maxWidth }}>
                      {column.render(row, start + i)}
                    </TableRowActions>
                  ) : (
                    <div
                      className={column.primary ? styles.tablePrimary : styles.tableValue}
                      style={{ maxWidth: column.maxWidth }}
                      title={column.text?.(row)}
                    >
                      {column.render(row, start + i)}
                    </div>
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {stop < rows.length && (
            <TableRow aria-hidden data-spacer>
              <TableCell
                colSpan={span}
                style={{ height: (rows.length - stop) * (effectiveRowHeight ?? 0), padding: 0 }}
              />
            </TableRow>
          )}
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={span}>{empty}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {height && more && <div className={cn(frame.frameFoot, styles.tableMore)}>{more}</div>}
    </div>
  );
  return (
    <div className={styles.tableShell} data-slot="data-table" data-variant={variant}>
      {scrollFrame}
      {!height && more && <div className={styles.actions}>{more}</div>}
      {footer && <div className={styles.status}>{footer}</div>}
      <span className={styles.sr} role="status">
        {selectable ? `${selected.length} selected. ` : ""}
        {rows.length} rows available{loadMore?.loading ? ". Loading more rows" : ""}
      </span>
    </div>
  );
}
export function EnvMark({ present, env }: { present: boolean; env?: string }) {
  return (
    <span aria-label={`${env ?? "Environment"}: ${present ? "present" : "missing"}`}>
      {present ? "✓" : "−"}
    </span>
  );
}
