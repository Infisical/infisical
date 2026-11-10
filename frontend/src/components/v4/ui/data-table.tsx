import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { FrameScope, useInFrame } from "../lib/frame-context";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Icon, type IconName } from "./icon";
import {
  rowActionSlots,
  RowActions,
  RowContextMenu,
  Table,
  TableActionsCell,
  TableActionsHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeadButton,
  TableHeader,
  TableLoadingRows,
  TableRow,
  TableRowActions,
  type RowAction,
  type UpToThree
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
  /** Sets the column in mono, for machine values compared character by character: secret keys, key IDs, hashes, hosts. Names people chose stay in the sans. */
  mono?: boolean;
  sortable?: boolean;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  grow?: boolean;
  align?: "start" | "end" | "center";
  actions?: boolean;
  /** true pins the column to the inline end (the actions tail); start pins it to the inline start, after a pinned selection column. */
  pin?: boolean | "start";
  hideHeader?: boolean;
}
export interface DataTableToggle<Row> {
  checked: (row: Row) => boolean | "indeterminate";
  onChange: (rowIds: string[], checked: boolean) => void;
  disabledReason?: (row: Row) => string | undefined;
  absent?: (row: Row) => boolean;
  adornment?: (row: Row) => React.ReactNode;
  label?: string;
}
export interface DataTableRowAction<Row> {
  label: string | ((row: Row) => string);
  icon: IconName | LucideIcon;
  onSelect: (row: Row) => void;
  disabledReason?: (row: Row) => string | undefined;
}
export interface DataTableRowActions<Row> {
  /** At most three icon actions, the same set on every row; a blocked one stays visible and disabled with its reason. */
  inline?: UpToThree<DataTableRowAction<Row>>;
  /** Items for the More menu after the inline actions, for everything past the first three. */
  renderMenu?: (row: Row) => React.ReactNode;
  menuLabel?: string;
  menuDisabledReason?: (row: Row) => string | undefined;
  header?: string;
}
export interface DataTableGroup<Row> {
  id: string;
  /** The header row's label, such as the parent resource's name or a link to it. */
  label: React.ReactNode;
  rows: readonly Row[];
  /** Muted text after the label, such as the group's row count. */
  meta?: React.ReactNode;
  /** The group's own actions, such as a RowActions menu, drawn in the actions tail. Needs rowActions. */
  actions?: React.ReactNode;
}
interface DataTableBaseProps<Row> {
  label: string;
  columns: readonly DataTableColumn<Row>[];
  getRowId: (row: Row) => string;
  rowLabel: (row: Row) => string;
  variant?: "basic" | "striped" | "bordered";
  selectable?: boolean;
  selectedIds?: readonly string[];
  defaultSelectedIds?: readonly string[];
  onSelectionChange?: (ids: string[]) => void;
  isSelectable?: (row: Row) => boolean;
  selectionDisabledReason?: (row: Row) => string | undefined;
  sort?: { columnId: string; direction: "asc" | "desc" };
  onSortChange?: (sort: { columnId: string; direction: "asc" | "desc" }) => void;
  empty?: React.ReactNode;
  height?: number;
  virtual?: boolean;
  rowHeight?: number;
  loadMore?: { label: string; onClick: () => void; loading?: boolean };
  end?: React.ReactNode;
  /**
   * State that must stay visible under the rows, such as "Showing 5 of 120 after filter". Never an
   * action result: copied, saved, deleted, moved, uploaded and failures go to a toast.
   */
  persistentStatus?: React.ReactNode;
  onRowActivate?: (row: Row) => void;
  pagination?: React.ReactNode;
  loading?: boolean;
  loadingRows?: number;
  actionBar?: React.ReactNode;
  /** Row ids being edited. Their rows render focused and the other rows dim until the value clears. */
  focusedRowId?: string | readonly string[];
  /** Persistent row actions in the sticky tail column: inline icon actions, then the More menu. */
  rowActions?: DataTableRowActions<Row>;
  /** Right-click (and Shift+F10 or the Menu key) on a data row opens its inline actions and More menu items. On by default with rowActions. */
  rowContextMenu?: boolean;
  /** The scroll container (vertical and horizontal), for ports that read scrollTop or observe it. */
  containerRef?: React.Ref<HTMLDivElement>;
  /** Layout classes for the scroll container, such as a flex-fill height. */
  containerClassName?: string;
  /** One level of child rows under a row, indented by space-row-indent. */
  getRowChildren?: (row: Row) => readonly Row[] | undefined;
}
export type DataTableProps<Row> = DataTableBaseProps<Row> &
  (
    | { rows: readonly Row[]; groups?: never }
    | {
        /** Rows under full-width group header rows, one tbody per group. Groups with no rows are not drawn. */
        groups: readonly DataTableGroup<Row>[];
        rows?: never;
      }
  );
export function DataTable<Row>({
  label,
  rows: flatRows,
  groups,
  getRowChildren,
  columns,
  getRowId,
  rowLabel,
  variant = "basic",
  selectable,
  selectedIds,
  defaultSelectedIds = [],
  onSelectionChange,
  isSelectable: isSelectableProp = () => true,
  selectionDisabledReason,
  sort,
  onSortChange,
  empty = "No rows",
  height,
  virtual = false,
  rowHeight,
  loadMore,
  end,
  persistentStatus,
  onRowActivate,
  pagination,
  loading = false,
  loadingRows = 5,
  actionBar,
  focusedRowId,
  rowActions,
  rowContextMenu = true,
  containerRef,
  containerClassName
}: DataTableProps<Row>) {
  const embedded = useInFrame("DataTable");
  const [ownSelected, setOwnSelected] = React.useState<readonly string[]>(defaultSelectedIds);
  const [top, setTop] = React.useState(0);
  const scroll = React.useRef<HTMLDivElement>(null);
  const attachScroll = React.useCallback(
    (node: HTMLDivElement | null) => {
      scroll.current = node;
      if (typeof containerRef === "function") containerRef(node);
      else if (containerRef) containerRef.current = node;
    },
    [containerRef]
  );
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
  const expand = (list: readonly Row[], depth: number) =>
    list.flatMap((row) => [
      { row, depth },
      ...(getRowChildren?.(row) ?? []).map((child) => ({ row: child, depth: depth + 1 }))
    ]);
  const sections = groups
    ? groups
        .filter((group) => group.rows.length > 0)
        .map((group) => ({ group, entries: expand(group.rows, 1) }))
    : [{ group: undefined, entries: expand(flatRows ?? [], 0) }];
  const entries = sections.flatMap((section) => section.entries);
  const rows = entries.map((entry) => entry.row);
  const indentColumn = (columns.find((column) => column.primary) ?? columns[0])?.id;
  const isSelectable = (row: Row) => isSelectableProp(row) && !selectionDisabledReason?.(row);
  const selected = selectedIds ?? ownSelected;
  const eligible = rows.filter(isSelectable).map(getRowId);
  const checked = eligible.filter((id) => selected.includes(id)).length;
  const update = (next: string[]) => {
    if (selectedIds === undefined) setOwnSelected(next);
    onSelectionChange?.(next);
  };
  const toggle = (id: string) =>
    update(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  const windowed = Boolean(height && virtual && !groups);
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
      `tbody tr[data-row-index="${focusRow}"]`
    );
    if (!row) return;
    focusPending.current = false;
    row.focus({ preventScroll: true });
  }, [focusRow, start]);
  const toggleCounts = (toggle: DataTableToggle<Row>) => {
    const enabled = rows.filter((row) => !toggle.absent?.(row) && !toggle.disabledReason?.(row));
    return {
      enabled,
      on: enabled.filter((row) => toggle.checked(row) === true).length,
      off: enabled.filter((row) => toggle.checked(row) === false).length
    };
  };
  const slots = rowActions
    ? rowActionSlots(rowActions.inline?.length ?? 0, Boolean(rowActions.renderMenu))
    : 0;
  const span = columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);
  const hasGrowingColumn = columns.some((column) => column.grow && column.width === undefined);
  const fixedLayout = columns.every(
    (column) => column.width !== undefined || column.grow || column.actions
  );
  const fixedFloor = columns
    .filter((column) => column.width === undefined)
    .map((column) => {
      if (column.actions) return "var(--v4-size-row)";
      return column.minWidth ? `${column.minWidth}px` : "var(--v4-size-cell-min)";
    });
  const fixedWidth = columns.reduce((sum, column) => sum + (column.width ?? 0), 0);
  const leading = columns.some((column) => column.pin === "start");
  const trailing =
    Boolean(rowActions) || columns.some((column) => column.pin === true || column.actions);
  const pinOffsets = new Map<string, string>();
  columns
    .filter((column) => column.pin === "start")
    .reduce((before, column) => {
      pinOffsets.set(column.id, `calc(${selectable ? "var(--v4-size-row)" : "0px"} + ${before}px)`);
      return before + (column.width ?? 0);
    }, 0);
  const columnStyle = (
    column: DataTableColumn<Row>
  ): React.CSSProperties & {
    "--v4-pin-offset"?: string;
  } => ({
    width: column.width ?? (hasGrowingColumn && !column.grow && !column.actions ? "1%" : undefined),
    minWidth: column.width ?? (column.actions ? undefined : (column.minWidth ?? 64)),
    maxWidth: column.maxWidth,
    textAlign: column.align,
    "--v4-pin-offset": pinOffsets.get(column.id)
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
  const rowInline = (row: Row) =>
    rowActions?.inline?.map((action) => ({
      label: typeof action.label === "string" ? action.label : action.label(row),
      icon: action.icon,
      disabledReason: action.disabledReason?.(row),
      onSelect: () => action.onSelect(row)
    })) as UpToThree<RowAction> | undefined;
  const renderRow = (
    { row, depth }: { row: Row; depth: number },
    position: number,
    rowIndex: number
  ) => {
    const tableRow = (
      <TableRow
        key={getRowId(row)}
        aria-rowindex={rowIndex}
        data-row-index={position}
        tabIndex={onRowActivate ? 0 : position === focusRow ? -1 : undefined}
        onBlur={position === focusRow ? () => setFocusRow(null) : undefined}
        data-state={selected.includes(getRowId(row)) ? "selected" : undefined}
        focused={
          typeof focusedRowId === "string"
            ? focusedRowId === getRowId(row)
            : Boolean(focusedRowId?.includes(getRowId(row)))
        }
        data-activatable={onRowActivate ? "" : undefined}
        onClick={onRowActivate ? () => onRowActivate(row) : undefined}
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
          <TableCell selection pin={leading ? "start" : undefined}>
            <SelectionBox
              label={`Select ${rowLabel(row)}`}
              checked={selected.includes(getRowId(row))}
              disabled={!isSelectable(row)}
              reason={selectionDisabledReason?.(row)}
              onToggle={() => toggle(getRowId(row))}
            />
          </TableCell>
        )}
        {columns.map((column) => (
          <TableCell
            key={column.id}
            className={column.actions ? styles.tableActions : undefined}
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
                {column.render?.(row, position)}
              </TableRowActions>
            ) : (
              <div
                className={column.primary ? styles.tablePrimary : styles.tableValue}
                data-mono={column.mono || undefined}
                data-depth={depth > 0 && column.id === indentColumn ? depth : undefined}
                style={{ maxWidth: column.maxWidth }}
                title={column.text?.(row)}
              >
                {column.render?.(row, position)}
              </div>
            )}
          </TableCell>
        ))}
        {rowActions && (
          <TableActionsCell slots={slots} data-pin="true">
            <RowActions
              lazy
              label={rowLabel(row)}
              inline={rowInline(row)}
              menu={rowActions.renderMenu?.(row)}
              menuLabel={rowActions.menuLabel}
              menuDisabledReason={rowActions.menuDisabledReason?.(row)}
            />
          </TableActionsCell>
        )}
      </TableRow>
    );
    if (!rowActions || rowContextMenu === false) return tableRow;
    return (
      <RowContextMenu
        key={getRowId(row)}
        label={rowLabel(row)}
        inline={rowInline(row)}
        menu={rowActions.renderMenu?.(row)}
        menuDisabledReason={rowActions.menuDisabledReason?.(row)}
      >
        {tableRow}
      </RowContextMenu>
    );
  };
  const scrollFrame = (
    <div
      ref={attachScroll}
      data-scroll-fade="x"
      data-has-start-pin={leading || undefined}
      data-has-end-pin={trailing || undefined}
      data-frame-foot={Boolean((height && more) || pagination) || undefined}
      className={cn(!embedded && frame.frame, styles.tableScroll, containerClassName)}
      data-virtual={windowed || undefined}
      style={tableStyle}
      onScroll={(event) => setTop(event.currentTarget.scrollTop)}
    >
      <Table
        aria-label={label}
        aria-rowcount={rows.length + (groups ? sections.length : 0) + 1}
        aria-busy={loading || undefined}
        data-variant={variant}
        data-layout={fixedLayout ? "fixed" : undefined}
        style={
          fixedLayout
            ? {
                minWidth: `calc(${[
                  `${fixedWidth}px`,
                  ...fixedFloor,
                  ...(selectable ? ["var(--v4-size-row)"] : []),
                  ...(rowActions
                    ? [`var(--v4-size-row) + ${slots - 1} * var(--v4-size-row-action-step)`]
                    : [])
                ].join(" + ")})`
              }
            : undefined
        }
      >
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead selection pin={leading ? "start" : undefined}>
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
                className={column.actions ? styles.tableActions : undefined}
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
                  <TableHeadButton
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
                  </TableHeadButton>
                ) : (
                  <span className={column.hideHeader || column.actions ? styles.sr : undefined}>
                    {column.header}
                  </span>
                )}
              </TableHead>
            ))}
            {rowActions && (
              <TableActionsHead slots={slots} data-pin="true">
                {rowActions.header ?? "Actions"}
              </TableActionsHead>
            )}
          </TableRow>
        </TableHeader>
        {(loading || !groups || !rows.length) && (
          <TableBody>
            {loading && (
              <TableLoadingRows
                rows={skeletonRows}
                selectable={selectable}
                actionSlots={rowActions ? slots : undefined}
                columns={columns.map((column) => ({
                  primary: column.primary,
                  actions: column.actions,
                  pin: column.pin,
                  maxWidth: column.maxWidth,
                  style: columnStyle(column)
                }))}
              />
            )}
            {!loading && start > 0 && (
              <TableRow aria-hidden data-spacer>
                <TableCell
                  colSpan={span}
                  style={{ height: start * (effectiveRowHeight ?? 0), padding: 0 }}
                />
              </TableRow>
            )}
            {!loading &&
              !groups &&
              entries
                .slice(start, stop)
                .map((entry, i) => renderRow(entry, start + i, start + i + 2))}
            {!loading && stop < rows.length && (
              <TableRow aria-hidden data-spacer>
                <TableCell
                  colSpan={span}
                  style={{ height: (rows.length - stop) * (effectiveRowHeight ?? 0), padding: 0 }}
                />
              </TableRow>
            )}
            {!loading && !rows.length && (
              <TableRow data-row-kind="empty">
                <TableCell colSpan={span}>{empty}</TableCell>
              </TableRow>
            )}
          </TableBody>
        )}
        {!loading &&
          groups &&
          sections.map(({ group, entries: groupEntries }, index) => {
            const offset = sections
              .slice(0, index)
              .reduce((sum, section) => sum + section.entries.length + 1, 0);
            const before = sections
              .slice(0, index)
              .reduce((sum, section) => sum + section.entries.length, 0);
            return (
              <TableBody key={group?.id} data-group="">
                <tr aria-rowindex={offset + 2} className={styles.tableGroupRow}>
                  {selectable && <TableCell selection />}
                  <th scope="rowgroup" colSpan={columns.length} className={styles.tableGroupHead}>
                    <div className={styles.tableGroupLabel}>
                      {group?.label}
                      {group?.meta !== undefined && (
                        <span className={styles.tableGroupMeta}>{group.meta}</span>
                      )}
                    </div>
                  </th>
                  {rowActions && (
                    <TableActionsCell slots={slots} data-pin="true">
                      {group?.actions}
                    </TableActionsCell>
                  )}
                </tr>
                {groupEntries.map((entry, i) => renderRow(entry, before + i, offset + i + 3))}
              </TableBody>
            );
          })}
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
      data-embedded={embedded || undefined}
    >
      <FrameScope framed>{scrollFrame}</FrameScope>
      {!height && more && <div className={styles.actions}>{more}</div>}
      {persistentStatus && <div className={styles.status}>{persistentStatus}</div>}
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
      {actionBar}
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
  counts: { enabled: Row[]; on: number; off: number };
  label: string;
  disabled: boolean;
  getRowId: (row: Row) => string;
}) {
  const { enabled, on, off } = counts;
  const all = enabled.length > 0 && on === enabled.length;
  const none = off === enabled.length;
  return (
    <span className={styles.tableToggle} data-slot="table-column-toggle">
      <Checkbox
        aria-label={label}
        disabled={disabled || !enabled.length}
        checked={all || (none ? false : "indeterminate")}
        onCheckedChange={() =>
          toggle.onChange(enabled.filter((row) => toggle.checked(row) !== !all).map(getRowId), !all)
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
  if (toggle.absent?.(row))
    return (
      <span className={styles.tableToggleAbsent} data-slot="table-toggle-absent">
        <span aria-hidden>−</span>
        <span className={styles.sr}>{`${label}: not applicable`}</span>
      </span>
    );
  const reason = toggle.disabledReason?.(row);
  const adornment = toggle.adornment?.(row);
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
  return (
    <span className={styles.tableToggleCell}>
      {reason ? <Tooltip content={reason}>{box}</Tooltip> : box}
      {adornment}
    </span>
  );
}

function SelectionBox({
  label,
  checked,
  disabled,
  reason,
  onToggle
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  reason?: string;
  onToggle: () => void;
}) {
  const box = (
    <div className={styles.tableSelection}>
      <Checkbox
        aria-label={label}
        aria-description={reason}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onToggle}
      />
    </div>
  );
  return reason ? <Tooltip content={reason}>{box}</Tooltip> : box;
}
