import {
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { Alert } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DiscardChangesAlertDialog
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import {
  DataGrid,
  type GridColumn,
  type GridSelection,
  type GridValue
} from "@infisical/cipher/ui/data-grid";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Skeleton } from "@infisical/cipher/ui/skeleton";

import { failed, saved, toast } from "../../../access/toast";
import { ExportMenu } from "./export-menu";
import { FilterPopover } from "./filter-popover";
import type { QueryResult, TableDetail } from "./protocol";
import {
  buildCountQuery,
  buildDeleteQuery,
  buildInsertQuery,
  buildSelectQuery,
  buildUpdateQuery,
  type FilterCondition,
  type SortCondition,
  type SqlDialect,
  supportsRowEditing,
  wrapInTransaction
} from "./sql";
import { useFillHeight } from "./use-fill-height";

type Values = Record<string, unknown>;
type GridRow = { key: string; isNew: boolean; values: Values };

const MASKED_VALUE = "[MASKED]";
const MAX_QUERY_SIZE = 50 * 1024;
const PAGE_SIZES = [25, 50, 100, 250, 500, 1000];
// The grid's status line and footer band sit under its scroll area
const GRID_CHROME_HEIGHT = 84;

const toCell = (value: unknown): GridValue => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const sameValue = (left: unknown, right: unknown) => {
  if (left === null || left === undefined || right === null || right === undefined)
    return (left ?? null) === (right ?? null);
  return String(left) === String(right);
};

const keyMatch = (values: Values, primaryKeys: string[]) =>
  Object.fromEntries(primaryKeys.map((column) => [column, values[column]]));

const hasMaskedKey = (values: Values, primaryKeys: string[]) =>
  primaryKeys.some((column) => {
    const value = values[column];
    return value === null || value === undefined || String(value).includes(MASKED_VALUE);
  });

const readOnlyReason = (dialect: SqlDialect, tableType?: string, hasMaskedKeys?: boolean) => {
  if (tableType === "view" || tableType === "materialized_view") return "This view is read-only.";
  if (!supportsRowEditing(dialect)) return "This table is read-only. Edit it from the SQL editor.";
  if (hasMaskedKeys)
    return "Output Masking hides this table's primary key, so its rows can't be edited here.";
  return "This table has no primary key. Browsing is read-only, and editing needs a primary key.";
};

const columnWidth = (type: string, name: string) => {
  const normalized = type.toLowerCase();
  if (/^(bool|boolean|smallint|int2)$/.test(normalized)) return 110;
  if (/^(integer|int4|serial)$/.test(normalized)) return 130;
  if (normalized === "uuid") return 300;
  if (/^(json|jsonb|text|xml)$/.test(normalized)) return 240;
  return Math.max(180, Math.min(350, name.length * 10 + 120));
};

export type BrowseGridHandle = { hasStagedChanges: () => boolean };

export const BrowseGrid = ({
  tableDetail,
  tableType,
  schema,
  table,
  connectionId,
  executeQuery,
  onRefresh,
  ref,
  dialect
}: {
  tableDetail: TableDetail | null;
  tableType?: string;
  schema: string;
  table: string;
  connectionId: string;
  executeQuery: (connectionId: string, sql: string) => Promise<QueryResult>;
  onRefresh: () => Promise<void>;
  ref?: Ref<BrowseGridHandle>;
  dialect: SqlDialect;
}) => {
  const [original, setOriginal] = useState<GridRow[]>([]);
  const [current, setCurrent] = useState<GridRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [sorts, setSorts] = useState<SortCondition[]>([]);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const requestRef = useRef(0);
  const newRowCounterRef = useRef(0);
  const [gridRef, gridHeight] = useFillHeight<HTMLDivElement>();

  const primaryKeys = useMemo(() => tableDetail?.primaryKeys ?? [], [tableDetail]);
  const tableColumns = useMemo(() => tableDetail?.columns ?? [], [tableDetail]);
  const hasMaskedKeys = original.some((row) => hasMaskedKey(row.values, primaryKeys));
  const canEditRows = primaryKeys.length > 0 && supportsRowEditing(dialect) && !hasMaskedKeys;
  const columnNames = tableColumns.map(({ name }) => name);

  const load = useCallback(
    async (next: {
      offset: number;
      pageSize: number;
      filters: FilterCondition[];
      sorts: SortCondition[];
    }) => {
      if (!tableDetail) return -1;
      requestRef.current += 1;
      const request = requestRef.current;
      setIsLoading(true);
      try {
        const [data, count] = await Promise.all([
          executeQuery(
            connectionId,
            buildSelectQuery({
              schema,
              table,
              filters: next.filters,
              sorts: next.sorts,
              limit: next.pageSize,
              offset: next.offset,
              primaryKeys,
              dialect
            })
          ),
          executeQuery(
            connectionId,
            buildCountQuery({ schema, table, filters: next.filters, dialect })
          )
        ]);
        if (request !== requestRef.current) return -1;
        // Masked keys repeat across rows, so those rows get an id of their own
        const rows = data.rows.map((values, index) => ({
          key:
            primaryKeys.length === 0 || hasMaskedKey(values, primaryKeys)
              ? `row:${next.offset + index}`
              : JSON.stringify(keyMatch(values, primaryKeys)),
          isNew: false,
          values
        }));
        setOriginal(rows);
        setCurrent(rows);
        setExecutionTimeMs(data.executionTimeMs);
        setTotalCount(Number(count.rows[0]?.count ?? 0));
        setSelectedKeys([]);
        setHasLoaded(true);
        return rows.length;
      } catch (error) {
        if (request === requestRef.current) failed("Failed to load data", error);
        return -1;
      } finally {
        if (request === requestRef.current) setIsLoading(false);
      }
    },
    [tableDetail, executeQuery, connectionId, schema, table, primaryKeys, dialect]
  );

  useEffect(() => {
    if (!tableDetail) return;
    load({ offset, pageSize, filters, sorts });
    // Reloads only when the table's detail arrives or is refreshed; paging and filters reload directly
  }, [tableDetail]);

  const originalByKey = useMemo(
    () => new Map(original.map((row) => [row.key, row.values])),
    [original]
  );

  const dirty = useMemo(() => {
    const cells: Record<string, Record<string, unknown>> = {};
    current.forEach((row) => {
      if (row.isNew) {
        cells[row.key] = row.values;
        return;
      }
      const before = originalByKey.get(row.key);
      if (!before) return;
      const changed = columnNames.filter(
        (column) => !sameValue(row.values[column], before[column])
      );
      if (changed.length > 0)
        cells[row.key] = Object.fromEntries(changed.map((column) => [column, row.values[column]]));
    });
    return cells;
  }, [current, originalByKey, columnNames]);
  const changeCount = Object.keys(dirty).length;
  useImperativeHandle(ref, () => ({ hasStagedChanges: () => changeCount > 0 }), [changeCount]);

  const pendingDiscardRef = useRef<((discarded: boolean) => void) | null>(null);
  const settleDiscard = (discarded: boolean) => {
    pendingDiscardRef.current?.(discarded);
    pendingDiscardRef.current = null;
  };
  const discardGuard = useDiscardChangesGuard({
    isDirty: changeCount > 0,
    onDiscard: () => {
      setCurrent(original);
      settleDiscard(true);
    }
  });
  const discardFirst = () =>
    new Promise<boolean>((resolve) => {
      pendingDiscardRef.current = resolve;
      discardGuard.requestDiscard();
    });

  const query = { offset, pageSize, filters, sorts };
  const reload = async (patch: Partial<typeof query> = {}) => {
    if (!(await discardFirst())) return -1;
    const next = { ...query, ...patch };
    setOffset(next.offset);
    setPageSize(next.pageSize);
    setFilters(next.filters);
    setSorts(next.sorts);
    return load(next);
  };

  const columns = useMemo<GridColumn<GridRow>[]>(() => {
    const keySet = new Set(primaryKeys);
    return tableColumns.map((column) => {
      const foreignKey = tableDetail?.foreignKeys.find(({ columns: keyColumns }) =>
        keyColumns.includes(column.name)
      );
      const target = foreignKey
        ? `${foreignKey.targetSchema}.${foreignKey.targetTable}(${
            foreignKey.targetColumns[foreignKey.columns.indexOf(column.name)] ??
            foreignKey.targetColumns[0]
          })`
        : undefined;
      return {
        id: column.name,
        header: target ? `${column.name} to ${target}` : column.name,
        type: column.type,
        nullable: column.nullable,
        primaryKey: keySet.has(column.name),
        editable: canEditRows,
        width: columnWidth(column.type, column.name),
        maxWidth: 600,
        getValue: (row) => toCell(row.values[column.name])
      };
    });
  }, [tableColumns, tableDetail, primaryKeys, canEditRows]);

  const runStatements = (statements: string[]) =>
    executeQuery(connectionId, wrapInTransaction(statements));

  const deleteRows = async () => {
    const selected = new Set(selectedKeys);
    const targets = current.filter((row) => selected.has(row.key));
    const pending = new Set(targets.filter((row) => row.isNew).map((row) => row.key));
    const persisted = targets.filter((row) => !row.isNew);
    if (pending.size > 0) setCurrent((rows) => rows.filter((row) => !pending.has(row.key)));
    setSelectedKeys([]);
    if (persisted.length === 0) return;
    try {
      await runStatements(
        persisted.map((row) =>
          buildDeleteQuery({
            schema,
            table,
            primaryKeyMatch: keyMatch(row.values, primaryKeys),
            dialect
          })
        )
      );
      saved(`Deleted ${persisted.length} ${persisted.length === 1 ? "row" : "rows"}`);
      const shown = await load(query);
      if (shown === 0 && offset > 0) reload({ offset: Math.max(0, offset - pageSize) });
    } catch (error) {
      failed("Delete failed", error);
    }
  };

  const save = async () => {
    try {
      const statements = current.flatMap((row) => {
        if (row.isNew) {
          const values = Object.fromEntries(
            columnNames
              .filter((column) => {
                const value = row.values[column];
                return value !== null && value !== undefined && String(value) !== "";
              })
              .map((column) => [column, row.values[column]])
          );
          return [buildInsertQuery({ schema, table, row: values, dialect })];
        }
        const changes = dirty[row.key];
        const before = originalByKey.get(row.key);
        if (!changes || !before) return [];
        return [
          buildUpdateQuery({
            schema,
            table,
            changes,
            primaryKeyMatch: keyMatch(before, primaryKeys),
            dialect
          })
        ];
      });
      if (statements.length === 0) {
        toast({ title: "No changes to save" });
        return;
      }
      if (statements.join(";\n").length > MAX_QUERY_SIZE) {
        toast({
          tone: "bad",
          title: "Save failed",
          description: "Changes are too large to save at once. Try saving fewer or smaller changes."
        });
        return;
      }
      setIsSaving(true);
      await runStatements(statements);
      saved(`Saved ${statements.length} ${statements.length === 1 ? "change" : "changes"}`);
      await load(query);
    } catch (error) {
      failed("Save failed", error);
    } finally {
      setIsSaving(false);
    }
  };

  const onSelectionChange = useCallback(
    (selection: GridSelection | null) => {
      if (!selection) {
        setSelectedKeys([]);
        return;
      }
      const keys = current.map((row) => row.key);
      const from = keys.indexOf(selection.anchor.rowId);
      const to = keys.indexOf(selection.active.rowId);
      if (from < 0 || to < 0) return;
      setSelectedKeys(keys.slice(Math.min(from, to), Math.max(from, to) + 1));
    },
    [current]
  );

  if (!tableDetail)
    return (
      <div style={{ flex: 1, padding: "var(--cipher-space-16)" }}>
        <Skeleton style={{ height: 240 }} />
      </div>
    );

  const sort = sorts[0];
  const busyReason = isLoading ? "Loading rows" : undefined;

  return (
    <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, minWidth: 0 }}>
      <div
        role="toolbar"
        aria-label={`${schema}.${table} actions`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--cipher-space-8)",
          padding: "var(--cipher-space-8) var(--cipher-space-12)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--cipher-space-8)" }}>
          <FilterPopover
            columns={tableColumns}
            filters={filters}
            dialect={dialect}
            onFiltersChange={async (next) => (await reload({ filters: next, offset: 0 })) >= 0}
          />
          {canEditRows && selectedKeys.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              icon="trash"
              onClick={async () => {
                if (await discardFirst()) setConfirmingDelete(true);
              }}
            >
              {`Delete ${selectedKeys.length} ${selectedKeys.length === 1 ? "row" : "rows"}`}
            </Button>
          )}
          {changeCount > 0 && (
            <>
              <Button size="sm" icon="check" loading={isSaving} onClick={save}>
                {`Save ${changeCount} ${changeCount === 1 ? "change" : "changes"}`}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon="undo"
                disabledReason={isSaving ? "Saving changes" : undefined}
                onClick={() => setCurrent(original)}
              >
                Discard changes
              </Button>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--cipher-space-8)" }}>
          {executionTimeMs !== null && (
            <span style={{ color: "var(--cipher-muted)", fontVariantNumeric: "tabular-nums" }}>
              {`${executionTimeMs} ms`}
            </span>
          )}
          <ExportMenu
            rows={current.map((row) => row.values)}
            columns={columnNames}
            disabledReason={current.length === 0 ? "No rows to export" : undefined}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            iconOnly
            icon="sync"
            aria-label="Refresh"
            disabledReason={busyReason}
            onClick={async () => {
              if (await discardFirst()) await onRefresh();
            }}
          />
        </div>
      </div>
      {!canEditRows && hasLoaded && (
        <div style={{ padding: "0 var(--cipher-space-12) var(--cipher-space-8)" }}>
          <Alert tone="info">{readOnlyReason(dialect, tableType, hasMaskedKeys)}</Alert>
        </div>
      )}
      <div ref={gridRef} style={{ position: "relative", flex: 1, minHeight: 0 }}>
        {!hasLoaded || !gridHeight ? (
          <div style={{ padding: "var(--cipher-space-12)" }}>
            <Skeleton style={{ height: 240 }} />
          </div>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
            <DataGrid
              label={`${schema}.${table}`}
              rows={current}
              columns={columns}
              getRowId={(row) => row.key}
              editable={canEditRows && !isSaving}
              dirty={dirty}
              height={Math.max(160, gridHeight - GRID_CHROME_HEIGHT)}
              rowNumberStart={offset + 1}
              empty={filters.length > 0 ? "No rows match these filters" : "This table has no rows"}
              sort={
                sort
                  ? { columnId: sort.column, direction: sort.direction === "ASC" ? "asc" : "desc" }
                  : undefined
              }
              onSortChange={(next) =>
                reload({
                  offset: 0,
                  sorts: [
                    { column: next.columnId, direction: next.direction === "asc" ? "ASC" : "DESC" }
                  ]
                })
              }
              onSelectionChange={onSelectionChange}
              onCellsChange={(changes) =>
                setCurrent((rows) =>
                  rows.map((row) => {
                    const edits = changes.filter(({ rowId }) => rowId === row.key);
                    if (edits.length === 0) return row;
                    return {
                      ...row,
                      values: {
                        ...row.values,
                        ...Object.fromEntries(edits.map(({ columnId, value }) => [columnId, value]))
                      }
                    };
                  })
                )
              }
              onAddRow={
                canEditRows
                  ? () => {
                      newRowCounterRef.current += 1;
                      const key = `new:${newRowCounterRef.current}`;
                      setCurrent((rows) => [
                        {
                          key,
                          isNew: true,
                          values: Object.fromEntries(columnNames.map((column) => [column, null]))
                        },
                        ...rows
                      ]);
                      return key;
                    }
                  : undefined
              }
              onAddRowCancel={(key) => setCurrent((rows) => rows.filter((row) => row.key !== key))}
              footer={
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Pagination
                    variant="compact"
                    label={`${schema}.${table} pages`}
                    page={Math.floor(offset / pageSize) + 1}
                    total={totalCount}
                    pageSize={pageSize}
                    pageSizeOptions={PAGE_SIZES}
                    loading={isLoading}
                    onPageChange={(page) => reload({ offset: (page - 1) * pageSize })}
                    onPageSizeChange={(size) => reload({ pageSize: size, offset: 0 })}
                  />
                </div>
              }
            />
          </div>
        )}
      </div>
      <DiscardChangesAlertDialog
        {...discardGuard.discardDialogProps}
        onOpenChange={(open) => {
          discardGuard.setIsDiscardDialogOpen(open);
          if (!open) settleDiscard(false);
        }}
        description="Your staged edits to this table will be lost."
      />
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent tone="danger">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete ${selectedKeys.length} ${selectedKeys.length === 1 ? "row" : "rows"} from ${schema}.${table}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the rows from the database and can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                await deleteRows();
                setConfirmingDelete(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
