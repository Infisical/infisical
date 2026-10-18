import * as React from "react";

import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

import styles from "./data.module.css";

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
  rowHeight = 40,
  loadMore,
  footer
}: DataTableProps<Row>) {
  const [ownSelected, setOwnSelected] = React.useState<readonly string[]>(defaultSelectedIds);
  const [top, setTop] = React.useState(0);
  const scroll = React.useRef<HTMLDivElement>(null);
  const [measuredRow, setMeasuredRow] = React.useState({ requested: rowHeight, height: rowHeight });
  const effectiveRowHeight = measuredRow.requested === rowHeight ? measuredRow.height : rowHeight;
  const selected = selectedIds ?? ownSelected;
  const eligible = rows.filter(isSelectable).map(getRowId);
  const checked = eligible.filter((id) => selected.includes(id)).length;
  const update = (next: string[]) => {
    if (selectedIds === undefined) setOwnSelected(next);
    onSelectionChange?.(next);
  };
  const start = height && virtual ? Math.max(0, Math.floor(top / effectiveRowHeight) - 4) : 0;
  const end =
    height && virtual
      ? Math.min(rows.length, start + Math.ceil(height / effectiveRowHeight) + 8)
      : rows.length;
  React.useLayoutEffect(() => {
    const container = scroll.current;
    if (!container || !height || !virtual) return;
    const visibleRows = Array.from(
      container.querySelectorAll<HTMLElement>("tbody tr[aria-rowindex]")
    );
    const measure = () => {
      const actual = Math.max(
        rowHeight,
        ...visibleRows.map((row) => row.getBoundingClientRect().height)
      );
      if (actual > effectiveRowHeight + 0.5)
        setMeasuredRow({ requested: rowHeight, height: actual });
    };
    measure();
    const observer = new ResizeObserver(measure);
    visibleRows.forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [rowHeight, effectiveRowHeight, height, virtual, start, end, rows, columns]);
  const span = columns.length + (selectable ? 1 : 0);
  const hasGrowingColumn = columns.some((column) => column.grow && column.width === undefined);
  const columnStyle = (column: DataTableColumn<Row>): React.CSSProperties => ({
    width: column.width ?? (hasGrowingColumn && !column.grow ? "1%" : undefined),
    minWidth: column.width ?? (column.actions ? undefined : (column.minWidth ?? 64)),
    maxWidth: column.maxWidth,
    textAlign: column.align
  });
  const tableStyle: React.CSSProperties & { "--v4-table-row-height": string } = {
    maxHeight: height,
    "--v4-table-row-height": `${effectiveRowHeight}px`
  };
  return (
    <div className={styles.tableShell} data-slot="data-table" data-variant={variant}>
      <div
        ref={scroll}
        className={styles.tableScroll}
        data-virtual={Boolean(height && virtual) || undefined}
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
                      onClick={() =>
                        onSortChange({
                          columnId: column.id,
                          direction:
                            sort?.columnId === column.id && sort.direction === "asc"
                              ? "desc"
                              : "asc"
                        })
                      }
                    >
                      {column.header} ↕
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
                  style={{ height: start * effectiveRowHeight, padding: 0 }}
                />
              </TableRow>
            )}
            {rows.slice(start, end).map((row, i) => (
              <TableRow
                key={getRowId(row)}
                aria-rowindex={start + i + 2}
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
                    <div
                      className={
                        column.actions
                          ? styles.tableActions
                          : column.primary
                            ? styles.tablePrimary
                            : styles.tableValue
                      }
                      style={{ maxWidth: column.maxWidth }}
                      title={column.actions ? undefined : column.text?.(row)}
                    >
                      {column.render(row, start + i)}
                    </div>
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {end < rows.length && (
              <TableRow aria-hidden data-spacer>
                <TableCell
                  colSpan={span}
                  style={{ height: (rows.length - end) * effectiveRowHeight, padding: 0 }}
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
      </div>
      {loadMore && (
        <div className={styles.actions}>
          <Button
            type="button"
            variant="outline"
            loading={Boolean(loadMore.loading)}
            onClick={loadMore.onClick}
          >
            {loadMore.label}
          </Button>
        </div>
      )}
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
