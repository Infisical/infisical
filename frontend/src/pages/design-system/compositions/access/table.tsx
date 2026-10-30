import type { ReactNode } from "react";

import { Checkbox } from "@app/components/v4/ui/checkbox";
import data from "@app/components/v4/ui/data.module.css";
import frame from "@app/components/v4/ui/frame.module.css";
import { Icon } from "@app/components/v4/ui/icon";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions
} from "@app/components/v4/ui/table";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import styles from "./access.module.css";

export type Sort = { columnId: string; direction: "asc" | "desc" };

export type AccessColumn<Row> = {
  id: string;
  header: string;
  render: (row: Row) => ReactNode;
  width?: number | string;
  sortable?: boolean;
  actions?: boolean;
  skeleton?: number | string;
};

const ariaSort = (sort: Sort | undefined, columnId: string) => {
  if (sort?.columnId !== columnId) return undefined;
  return sort.direction === "asc" ? "ascending" : "descending";
};

export function AccessTable<Row>({
  label,
  rows,
  columns,
  getRowId,
  rowLabel,
  selection,
  sort,
  onSortChange,
  onRowClick,
  isMuted,
  loading,
  empty
}: {
  label: string;
  rows: readonly Row[];
  columns: readonly AccessColumn<Row>[];
  getRowId: (row: Row) => string;
  rowLabel: (row: Row) => string;
  selection?: {
    selected: readonly string[];
    onChange: (ids: string[]) => void;
    blockedReason?: (row: Row) => string | undefined;
  };
  sort?: Sort;
  onSortChange?: (sort: Sort) => void;
  onRowClick?: (row: Row) => void;
  isMuted?: (row: Row) => boolean;
  loading?: number;
  empty?: ReactNode;
}) {
  const eligible = selection
    ? rows.filter((row) => !selection.blockedReason?.(row)).map(getRowId)
    : [];
  const checked = selection ? eligible.filter((id) => selection.selected.includes(id)).length : 0;
  const span = columns.length + (selection ? 1 : 0);
  return (
    <div className={data.tableShell} data-slot="access-table">
      <div className={`${frame.frame} ${data.tableScroll}`} data-scroll-fade="x">
        <Table aria-label={label} aria-busy={loading ? true : undefined}>
          <TableHeader>
            <TableRow>
              {selection && (
                <TableHead className={data.tableCheck}>
                  <Checkbox
                    aria-label={`Select all available rows in ${label}`}
                    disabled={!eligible.length || Boolean(loading)}
                    checked={
                      checked > 0 && checked < eligible.length
                        ? "indeterminate"
                        : eligible.length > 0 && checked === eligible.length
                    }
                    onCheckedChange={() =>
                      selection.onChange(
                        checked === eligible.length
                          ? selection.selected.filter((id) => !eligible.includes(id))
                          : [...new Set([...selection.selected, ...eligible])]
                      )
                    }
                  />
                </TableHead>
              )}
              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  scope="col"
                  style={{ width: column.width }}
                  data-actions={column.actions || undefined}
                  aria-sort={ariaSort(sort, column.id)}
                >
                  {column.sortable && onSortChange ? (
                    <button
                      type="button"
                      className={data.tableSort}
                      data-active={sort?.columnId === column.id || undefined}
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
                    <span className={column.actions ? data.sr : undefined}>{column.header}</span>
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: loading }, (_, index) => (
                  <TableRow key={`skeleton-${index + 1}`}>
                    {selection && (
                      <TableCell className={data.tableCheck}>
                        <Skeleton width={16} height={16} />
                      </TableCell>
                    )}
                    {columns.map((column) => (
                      <TableCell key={column.id} data-actions={column.actions || undefined}>
                        <Skeleton
                          width={column.skeleton ?? (column.actions ? 16 : "70%")}
                          height={column.actions ? 16 : 12}
                          className={column.actions ? styles.skeletonEnd : undefined}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : rows.map((row) => {
                  const id = getRowId(row);
                  const blocked = selection?.blockedReason?.(row);
                  const isSelected = Boolean(selection?.selected.includes(id));
                  return (
                    <TableRow
                      key={id}
                      className={onRowClick ? styles.linkedRow : undefined}
                      data-state={isSelected ? "selected" : undefined}
                      data-muted={isMuted?.(row) || undefined}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
                      {selection && (
                        <TableCell
                          className={data.tableCheck}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className={data.tableSelection}>
                            {blocked ? (
                              <Tooltip content={blocked}>
                                <span className={styles.blockedCheck}>
                                  <Checkbox aria-label={blocked} checked={false} disabled />
                                </span>
                              </Tooltip>
                            ) : (
                              <Checkbox
                                aria-label={`Select ${rowLabel(row)}`}
                                checked={isSelected}
                                onCheckedChange={() =>
                                  selection.onChange(
                                    isSelected
                                      ? selection.selected.filter((value) => value !== id)
                                      : [...selection.selected, id]
                                  )
                                }
                              />
                            )}
                          </div>
                        </TableCell>
                      )}
                      {columns.map((column) => (
                        <TableCell
                          key={column.id}
                          style={{ width: column.width }}
                          data-actions={column.actions || undefined}
                          onClick={column.actions ? (event) => event.stopPropagation() : undefined}
                        >
                          {column.actions ? (
                            <TableRowActions>{column.render(row)}</TableRowActions>
                          ) : (
                            <div className={styles.cell}>{column.render(row)}</div>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
            {!loading && !rows.length && (
              <TableRow>
                <TableCell colSpan={span} className={styles.emptyCell}>
                  {empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
