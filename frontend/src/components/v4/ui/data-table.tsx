import * as React from "react";

import { cn } from "../lib/utils";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { FloatingActionBarHostContext } from "./floating-action-bar";
import { Icon } from "./icon";
import { Skeleton } from "./skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions
} from "./table";
import { Tooltip } from "./tooltip";

import styles from "./data.module.css";
import frame from "./frame.module.css";

export interface DataTableColumn<Row> {
  id: string;
  header: string;
  render?: (row: Row, index: number) => React.ReactNode;
  toggle?: DataTableToggle<Row>;
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
export interface DataTableToggle<Row> {
  checked: (row: Row) => boolean;
  onChange: (rowIds: string[], checked: boolean) => void;
  disabledReason?: (row: Row) => string | undefined;
  label?: string;
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
  onRowActivate?: (row: Row) => void;
  pagination?: React.ReactNode;
  loading?: boolean;
  loadingRows?: number;
  actionBar?: React.ReactNode;
}
const interactiveTarget =
  "a, button, input, select, textarea, label, summary, [contenteditable], [tabindex]:not(tr), [role=button], [role=checkbox], [role=combobox], [role=link], [role=menuitem], [role=switch], [role=tab], [data-row-interactive]";
const activatesRow = (event: React.MouseEvent<HTMLTableRowElement>) => {
  const row = event.currentTarget;
  const target = event.target as Element;
  if (event.button !== 0 || !row.contains(target)) return false;
  const interactive = target.closest(interactiveTarget);
  if (interactive && row.contains(interactive)) return false;
  const selection = window.getSelection();
  return !(selection && !selection.isCollapsed && row.contains(selection.anchorNode));
};
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
  footer,
  onRowActivate,
  pagination,
  loading = false,
  loadingRows = 5,
  actionBar
}: DataTableProps<Row>) {
  const [barPlacement, setBarPlacement] = React.useState<"fixed" | "contained" | null>(null);
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
  const toggle = (id: string) =>
    update(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
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
  const toggleCounts = (toggle: DataTableToggle<Row>) => {
    const enabled = rows.filter((row) => !toggle.disabledReason?.(row));
    return { enabled, on: enabled.filter(toggle.checked).length };
  };
  const span = columns.length + (selectable ? 1 : 0);
  const hasGrowingColumn = columns.some((column) => column.grow && column.width === undefined);
  const fixedLayout = columns.every((column) => column.width !== undefined || column.grow);
  const fixedFloor = columns
    .filter((column) => column.width === undefined)
    .map((column) => (column.minWidth ? `${column.minWidth}px` : "var(--v4-size-cell-min)"));
  const fixedWidth = columns.reduce((sum, column) => sum + (column.width ?? 0), 0);
  const columnStyle = (column: DataTableColumn<Row>): React.CSSProperties => ({
    width: column.width ?? (hasGrowingColumn && !column.grow ? "1%" : undefined),
    minWidth: column.width ?? (column.actions ? undefined : (column.minWidth ?? 64)),
    maxWidth: column.maxWidth,
    textAlign: column.align
  });
  const skeletonRows = Math.max(1, Math.floor(loadingRows));
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
      <Table
        aria-label={label}
        aria-rowcount={rows.length + 1}
        aria-busy={loading || undefined}
        data-variant={variant}
        data-layout={fixedLayout ? "fixed" : undefined}
        style={
          fixedLayout
            ? {
                minWidth: `calc(${[`${fixedWidth}px`, ...fixedFloor, ...(selectable ? ["var(--v4-size-control-lg)"] : [])].join(" + ")})`
              }
            : undefined
        }
      >
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className={styles.tableCheck}>
                <Checkbox
                  aria-label={`Select all available rows in ${label}`}
                  disabled={loading || !eligible.length}
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
                {column.toggle && (
                  <ToggleHead
                    toggle={column.toggle}
                    counts={toggleCounts(column.toggle)}
                    label={column.toggle.label ?? `${column.header} for every row in ${label}`}
                    disabled={loading}
                    getRowId={getRowId}
                  />
                )}
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
          {loading &&
            Array.from({ length: skeletonRows }, (_, index) => (
              <TableRow key={`loading-${index}`} aria-hidden data-loading>
                {selectable && (
                  <TableCell className={styles.tableCheck}>
                    <div className={styles.tableSelection}>
                      <Skeleton width="var(--v4-size-icon)" height="var(--v4-size-icon)" />
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
                      <TableRowActions>
                        <Skeleton width="var(--v4-size-glyph)" height="var(--v4-size-glyph)" />
                      </TableRowActions>
                    ) : (
                      <Skeleton
                        className={styles.tableSkeleton}
                        data-primary={column.primary || undefined}
                        style={{ maxWidth: column.maxWidth }}
                      />
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {!loading && start > 0 && (
            <TableRow aria-hidden data-spacer>
              <TableCell
                colSpan={span}
                style={{ height: start * (effectiveRowHeight ?? 0), padding: 0 }}
              />
            </TableRow>
          )}
          {!loading &&
            rows.slice(start, stop).map((row, i) => (
              <TableRow
                key={getRowId(row)}
                aria-rowindex={start + i + 2}
                tabIndex={onRowActivate ? 0 : start + i === focusRow ? -1 : undefined}
                onBlur={start + i === focusRow ? () => setFocusRow(null) : undefined}
                data-state={selected.includes(getRowId(row)) ? "selected" : undefined}
                data-activatable={onRowActivate ? "" : undefined}
                onClick={
                  onRowActivate
                    ? (event) => {
                        if (activatesRow(event)) onRowActivate(row);
                      }
                    : undefined
                }
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" && onRowActivate) {
                    event.preventDefault();
                    onRowActivate(row);
                  } else if (event.key === " " && selectable && isSelectable(row)) {
                    event.preventDefault();
                    toggle(getRowId(row));
                  }
                }}
                style={{ height: effectiveRowHeight }}
              >
                {selectable && (
                  <TableCell className={styles.tableCheck} data-row-interactive>
                    <div className={styles.tableSelection}>
                      <Checkbox
                        aria-label={`Select ${rowLabel(row)}`}
                        checked={selected.includes(getRowId(row))}
                        disabled={!isSelectable(row)}
                        onCheckedChange={() => toggle(getRowId(row))}
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
                    data-row-interactive={column.actions || column.toggle ? true : undefined}
                  >
                    {column.toggle ? (
                      <ToggleCell
                        toggle={column.toggle}
                        row={row}
                        label={`${column.header} for ${rowLabel(row)}`}
                        rowId={getRowId(row)}
                      />
                    ) : column.actions ? (
                      <TableRowActions style={{ maxWidth: column.maxWidth }}>
                        {column.render?.(row, start + i)}
                      </TableRowActions>
                    ) : (
                      <div
                        className={column.primary ? styles.tablePrimary : styles.tableValue}
                        style={{ maxWidth: column.maxWidth }}
                        title={column.text?.(row)}
                      >
                        {column.render?.(row, start + i)}
                      </div>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {!loading && stop < rows.length && (
            <TableRow aria-hidden data-spacer>
              <TableCell
                colSpan={span}
                style={{ height: (rows.length - stop) * (effectiveRowHeight ?? 0), padding: 0 }}
              />
            </TableRow>
          )}
          {!loading && !rows.length && (
            <TableRow>
              <TableCell colSpan={span}>{empty}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {height && more && <div className={cn(frame.frameFoot, styles.tableMore)}>{more}</div>}
      {pagination && (
        <div
          className={cn(frame.frameFoot, styles.tablePagination)}
          data-slot="data-table-pagination"
        >
          {pagination}
        </div>
      )}
    </div>
  );
  return (
    <div
      className={styles.tableShell}
      data-slot="data-table"
      data-variant={variant}
      data-action-bar={barPlacement ?? undefined}
    >
      {scrollFrame}
      {!height && more && <div className={styles.actions}>{more}</div>}
      {footer && <div className={styles.status}>{footer}</div>}
      <span className={styles.sr} role="status">
        {loading ? (
          "Loading rows"
        ) : (
          <>
            {selectable ? `${selected.length} selected. ` : ""}
            {rows.length} rows available{loadMore?.loading ? ". Loading more rows" : ""}
          </>
        )}
      </span>
      {actionBar && (
        <FloatingActionBarHostContext.Provider value={setBarPlacement}>
          {actionBar}
        </FloatingActionBarHostContext.Provider>
      )}
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

function ToggleHead<Row>({
  toggle,
  counts,
  label,
  disabled,
  getRowId
}: {
  toggle: DataTableToggle<Row>;
  counts: { enabled: Row[]; on: number };
  label: string;
  disabled: boolean;
  getRowId: (row: Row) => string;
}) {
  const { enabled, on } = counts;
  const all = enabled.length > 0 && on === enabled.length;
  return (
    <span className={styles.tableToggle} data-slot="table-column-toggle">
      <Checkbox
        aria-label={label}
        disabled={disabled || !enabled.length}
        checked={on > 0 && !all ? "indeterminate" : all}
        onCheckedChange={() =>
          toggle.onChange(enabled.filter((row) => toggle.checked(row) === all).map(getRowId), !all)
        }
      />
    </span>
  );
}

function ToggleCell<Row>({
  toggle,
  row,
  label,
  rowId
}: {
  toggle: DataTableToggle<Row>;
  row: Row;
  label: string;
  rowId: string;
}) {
  const reason = toggle.disabledReason?.(row);
  const box = (
    <span className={styles.tableToggle}>
      <Checkbox
        aria-label={label}
        aria-description={reason}
        checked={toggle.checked(row)}
        disabled={Boolean(reason)}
        onCheckedChange={(next) => toggle.onChange([rowId], next === true)}
      />
    </span>
  );
  return reason ? <Tooltip content={reason}>{box}</Tooltip> : box;
}
