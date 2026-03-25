import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CellContext, ColumnDef, HeaderContext } from "@tanstack/react-table";

import { createNotification } from "@app/components/notifications";
import { Checkbox } from "@app/components/v3/generic/Checkbox";
import type { CellOpts } from "@app/components/v3/generic/DataGrid";
import { DataGrid, useDataGrid } from "@app/components/v3/generic/DataGrid";
import { Skeleton } from "@app/components/v3/generic/Skeleton";

import type { ColumnInfo, FieldInfo, ForeignKeyInfo, TableDetail } from "../data-explorer-types";
import type { FilterCondition, SortCondition } from "../sql-generation";
import {
  buildCountQuery,
  buildDeleteQuery,
  buildInsertQuery,
  buildSelectQuery,
  buildUpdateQuery,
  wrapInTransaction
} from "../sql-generation";
import { DataExplorerToolbar } from "./DataExplorerToolbar";

type DataExplorerGridProps = {
  tableDetail: TableDetail | null;
  schema: string;
  table: string;
  executeQuery: (sql: string) => Promise<{
    rows: Record<string, unknown>[];
    fields: FieldInfo[];
    rowCount: number | null;
    command: string;
    executionTimeMs: number;
  }>;
  isLoading: boolean;
  onChangeCountUpdate?: (count: number) => void;
  onFullRefresh?: () => Promise<void>;
};

const ROW_KEY_PREFIX = "__new_";

function cellValuesEqual(a: unknown, b: unknown): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return String(a) === String(b);
}

function pgTypeToCellOpts(): CellOpts {
  return { variant: "short-text" };
}

function getColumnSize(col: ColumnInfo): number {
  const t = col.type.toLowerCase();
  if (t === "boolean" || t === "bool" || t === "smallint" || t === "int2") return 100;
  if (t === "integer" || t === "int4" || t === "serial") return 120;
  if (t === "uuid") return 280;
  if (t === "json" || t === "jsonb") return 250;
  if (t === "text" || t === "xml") return 220;
  // Scale with column name length as a rough heuristic (higher minimum for wide/special chars)
  return Math.max(150, Math.min(300, col.name.length * 10 + 100));
}

type RowData = Record<string, unknown>;

type SelectionMeta = {
  onRowSelect?: (rowIndex: number, checked: boolean, shiftKey: boolean) => void;
  onSelectionCountChange?: () => void;
};

function SelectHeader({ table: t }: HeaderContext<RowData, unknown>) {
  const meta = t.options.meta as SelectionMeta | undefined;
  const isAllSelected = t.getIsAllRowsSelected();
  const isSomeSelected = t.getIsSomeRowsSelected();
  return (
    <Checkbox
      isChecked={isAllSelected || isSomeSelected}
      isIndeterminate={isSomeSelected && !isAllSelected}
      onCheckedChange={() => {
        t.toggleAllRowsSelected(!isAllSelected);
        requestAnimationFrame(() => meta?.onSelectionCountChange?.());
      }}
    />
  );
}

function SelectCell({ row, table: t }: CellContext<RowData, unknown>) {
  const meta = t.options.meta as SelectionMeta | undefined;
  const isSelected = row.getIsSelected();
  return (
    <Checkbox
      isChecked={isSelected}
      onCheckedChange={(checked) => {
        if (meta?.onRowSelect) {
          meta.onRowSelect(row.index, Boolean(checked), false);
        } else {
          row.toggleSelected(Boolean(checked));
        }
        requestAnimationFrame(() => meta?.onSelectionCountChange?.());
      }}
    />
  );
}

const SELECT_COLUMN: ColumnDef<RowData> = {
  id: "select",
  header: SelectHeader,
  cell: SelectCell,
  size: 40,
  minSize: 40,
  maxSize: 40,
  enableSorting: false,
  enableHiding: false,
  enablePinning: false,
  enableResizing: false
};

function getColumnIndicator(
  colName: string,
  primaryKeys: string[],
  fkMap: Map<string, ForeignKeyInfo>
): { type: "pk" | "fk"; tooltip?: string } | undefined {
  if (primaryKeys.includes(colName)) return { type: "pk" };
  const fk = fkMap.get(colName);
  if (fk) {
    const targetCol = fk.targetColumns[fk.columns.indexOf(colName)] ?? fk.targetColumns[0];
    return {
      type: "fk",
      tooltip: `\u2192 ${fk.targetSchema}.${fk.targetTable}(${targetCol})`
    };
  }
  return undefined;
}

function buildColumnDefs(
  cols: ColumnInfo[],
  primaryKeys: string[],
  foreignKeys: ForeignKeyInfo[]
): ColumnDef<Record<string, unknown>>[] {
  // Build a map from column name → FK info for O(1) lookup
  const fkMap = new Map<string, ForeignKeyInfo>();
  foreignKeys.forEach((fk) => {
    fk.columns.forEach((c) => {
      if (!fkMap.has(c)) fkMap.set(c, fk);
    });
  });

  return cols.map((col) => ({
    id: col.name,
    accessorKey: col.name,
    header: col.name,
    meta: {
      label: col.name,
      typeLabel: col.type,
      cell: pgTypeToCellOpts(),
      columnIndicator: getColumnIndicator(col.name, primaryKeys, fkMap)
    },
    size: getColumnSize(col),
    minSize: 80,
    maxSize: 600,
    enableSorting: true,
    enablePinning: true,
    enableHiding: true
  }));
}

function getRowKey(row: Record<string, unknown>, primaryKeys: string[]): string {
  if (primaryKeys.length === 0) return "";
  const keyObj: Record<string, unknown> = {};
  primaryKeys.forEach((pk) => {
    keyObj[pk] = row[pk];
  });
  return JSON.stringify(keyObj);
}

function getPkMatch(row: Record<string, unknown>, primaryKeys: string[]): Record<string, unknown> {
  const match: Record<string, unknown> = {};
  primaryKeys.forEach((pk) => {
    match[pk] = row[pk];
  });
  return match;
}

export const DataExplorerGrid = ({
  tableDetail,
  schema,
  table,
  executeQuery,
  isLoading,
  onChangeCountUpdate,
  onFullRefresh
}: DataExplorerGridProps) => {
  const [originalData, setOriginalData] = useState<Record<string, unknown>[]>([]);
  const [currentData, setCurrentData] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [sorts, setSorts] = useState<SortCondition[]>([]);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [newRowTempIds, setNewRowTempIds] = useState<Set<string>>(new Set());
  const newRowCounterRef = useRef(0);
  const hasLoadedRef = useRef(false);

  const primaryKeys = tableDetail?.primaryKeys ?? [];
  const foreignKeys = tableDetail?.foreignKeys ?? [];
  const tableColumns = tableDetail?.columns ?? [];
  const hasPrimaryKey = primaryKeys.length > 0;
  const primaryKeysRef = useRef(primaryKeys);
  primaryKeysRef.current = primaryKeys;

  const [selectedRowCount, setSelectedRowCount] = useState(0);
  const gridRef = useRef<ReturnType<typeof useDataGrid<Record<string, unknown>>>["table"] | null>(
    null
  );
  // Snapshot selected rows so the toolbar delete button can use them even after
  // the DataGrid's outside-click handler clears row selection on mousedown.
  const selectedRowsRef = useRef<Record<string, unknown>[]>([]);

  // Build TanStack Table column definitions from PG metadata
  const columnDefs = useMemo(
    () =>
      hasPrimaryKey
        ? [SELECT_COLUMN, ...buildColumnDefs(tableColumns, primaryKeys, foreignKeys)]
        : buildColumnDefs(tableColumns, primaryKeys, foreignKeys),
    [hasPrimaryKey, tableColumns, primaryKeys, foreignKeys]
  );

  const fetchData = useCallback(
    async (o: number, ps: number, f: FilterCondition[], s: SortCondition[]): Promise<number> => {
      if (!tableDetail) return 0;
      setIsDataLoading(true);
      try {
        const selectSql = buildSelectQuery({
          schema,
          table,
          filters: f,
          sorts: s,
          limit: ps,
          offset: o,
          primaryKeys
        });
        const countSql = buildCountQuery({ schema, table, filters: f });

        // These two queries don't share a database snapshot (the backend processes them
        // sequentially, not in a single transaction), so the count could be off by 1 if
        // another session modifies data between them. Acceptable for a data explorer.
        const [dataResult, countResult] = await Promise.all([
          executeQuery(selectSql),
          executeQuery(countSql)
        ]);

        const taggedRows = dataResult.rows.map((row: Record<string, unknown>) => ({
          ...row,
          originalPkKey: getRowKey(row, primaryKeys)
        }));
        setOriginalData(taggedRows);
        setCurrentData(taggedRows);
        setExecutionTimeMs(dataResult.executionTimeMs);
        setTotalCount(Number(countResult.rows[0]?.count ?? 0));
        setNewRowTempIds(new Set());
        setSelectedRowCount(0);
        selectedRowsRef.current = [];
        hasLoadedRef.current = true;
        return dataResult.rows.length;
      } catch (err) {
        createNotification({
          title: "Failed to load data",
          text: err instanceof Error ? err.message : "Unknown error",
          type: "error"
        });
        return 0;
      } finally {
        setIsDataLoading(false);
      }
    },
    [tableDetail, schema, table, primaryKeys, executeQuery]
  );

  // Fetch data when filters/sorts/pagination change.
  // Table switches are handled by the parent via key={schema.table} which
  // remounts this component with fresh state — no manual reset needed.
  const prevFetchKeyRef = useRef("");
  const fetchKey = `${schema}.${table}.${offset}.${pageSize}.${JSON.stringify(filters)}.${JSON.stringify(sorts)}`;
  if (fetchKey !== prevFetchKeyRef.current && tableDetail && !isLoading) {
    prevFetchKeyRef.current = fetchKey;
    fetchData(offset, pageSize, filters, sorts);
  }

  const handleFiltersChange = useCallback((newFilters: FilterCondition[]) => {
    setFilters(newFilters);
    setOffset(0);
  }, []);

  const handleSortsChange = useCallback((newSorts: SortCondition[]) => {
    setSorts(newSorts);
    setOffset(0);
  }, []);

  const handleOffsetChange = useCallback((newOffset: number) => {
    setOffset(Math.max(0, newOffset));
  }, []);

  const handlePageSizeChange = useCallback((newSize: number) => {
    setPageSize(newSize);
    setOffset(0);
  }, []);

  // PK-based lookup map for O(1) original row matching (avoids index misalignment after prepend)
  const originalDataByPk = useMemo(() => {
    if (primaryKeys.length === 0) return null;
    const map = new Map<string, Record<string, unknown>>();
    originalData.forEach((row) => {
      map.set(getRowKey(row, primaryKeys), row);
    });
    return map;
  }, [originalData, primaryKeys]);

  const originalDataByPkRef = useRef(originalDataByPk);
  originalDataByPkRef.current = originalDataByPk;

  // Change tracking — use PK-based lookup so new row prepends don't misalign indices
  const changeCount = useMemo(() => {
    let count = newRowTempIds.size;
    if (!originalDataByPk) return count;
    currentData.forEach((row) => {
      if (row.tempRowId && newRowTempIds.has(String(row.tempRowId))) return;
      const key = row.originalPkKey as string;
      if (!key) return;
      const original = originalDataByPk.get(key);
      if (!original) return;
      const hasChanges = tableColumns.some(
        (col) => !cellValuesEqual(row[col.name], original[col.name])
      );
      if (hasChanges) count += 1;
    });
    return count;
  }, [currentData, originalDataByPk, primaryKeys, newRowTempIds, tableColumns]);

  useEffect(() => {
    onChangeCountUpdate?.(changeCount);
  }, [changeCount, onChangeCountUpdate]);

  const handleAddRecord = useCallback(() => {
    newRowCounterRef.current += 1;
    const tempId = `${ROW_KEY_PREFIX}${newRowCounterRef.current}`;
    const newRow: Record<string, unknown> = { tempRowId: tempId };
    tableColumns.forEach((col) => {
      newRow[col.name] = null;
    });
    setCurrentData((prev) => [newRow, ...prev]);
    setNewRowTempIds((prev) => new Set(prev).add(tempId));
    return null;
  }, [tableColumns]);

  const handleRowsDelete = useCallback(
    async (_rows: Record<string, unknown>[], rowIndices: number[]) => {
      const tempIdsToRemove: string[] = [];
      const deleteStatements: string[] = [];

      rowIndices.forEach((idx) => {
        const row = currentData[idx];
        if (!row) return;
        const tempId = row.tempRowId ? String(row.tempRowId) : null;
        if (tempId) {
          tempIdsToRemove.push(tempId);
        } else {
          deleteStatements.push(
            buildDeleteQuery({ schema, table, primaryKeyMatch: getPkMatch(row, primaryKeys) })
          );
        }
      });

      // Remove unsaved new rows from local state immediately
      if (tempIdsToRemove.length > 0) {
        const tempIdSet = new Set(tempIdsToRemove);
        setCurrentData((prev) =>
          prev.filter((r) => !r.tempRowId || !tempIdSet.has(String(r.tempRowId)))
        );
        setNewRowTempIds((prev) => {
          const next = new Set(prev);
          tempIdsToRemove.forEach((id) => next.delete(id));
          return next;
        });
      }

      // Execute DELETE SQL for persisted rows immediately
      if (deleteStatements.length > 0) {
        try {
          const sql = wrapInTransaction(deleteStatements);
          await executeQuery(sql);
          createNotification({
            text: `Deleted ${deleteStatements.length} row${deleteStatements.length !== 1 ? "s" : ""}`,
            type: "success"
          });
          const rowCount = await fetchData(offset, pageSize, filters, sorts);
          if (rowCount === 0 && offset > 0) {
            setOffset(Math.max(0, offset - pageSize));
          }
        } catch (err) {
          createNotification({
            title: "Delete failed",
            text: err instanceof Error ? err.message : "Unknown error",
            type: "error"
          });
        }
      }
    },
    [
      currentData,
      primaryKeys,
      schema,
      table,
      executeQuery,
      fetchData,
      offset,
      pageSize,
      filters,
      sorts
    ]
  );

  const handleDiscard = useCallback(() => {
    setCurrentData(originalData);
    setNewRowTempIds(new Set());
  }, [originalData]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const statements: string[] = [];

      // Inserts (new rows)
      currentData.forEach((row) => {
        const tempId = row.tempRowId ? String(row.tempRowId) : null;
        if (!tempId || !newRowTempIds.has(tempId)) return;
        const values: Record<string, unknown> = {};
        tableColumns.forEach((col) => {
          if (
            row[col.name] !== null &&
            row[col.name] !== undefined &&
            String(row[col.name]) !== ""
          ) {
            values[col.name] = row[col.name];
          }
        });
        statements.push(buildInsertQuery({ schema, table, row: values }));
      });

      // Updates (changed rows) — use PK-based lookup so prepends don't misalign
      const pkMap = originalDataByPk;
      currentData.forEach((row) => {
        if (row.tempRowId) return;
        const key = row.originalPkKey as string;
        const original = key && pkMap ? pkMap.get(key) : undefined;
        if (!original) return;
        const changes: Record<string, unknown> = {};
        tableColumns.forEach((col) => {
          if (!cellValuesEqual(row[col.name], original[col.name])) {
            changes[col.name] = row[col.name];
          }
        });
        if (Object.keys(changes).length > 0) {
          statements.push(
            buildUpdateQuery({
              schema,
              table,
              changes,
              primaryKeyMatch: getPkMatch(original, primaryKeys)
            })
          );
        }
      });

      if (statements.length === 0) {
        createNotification({ text: "No changes to save", type: "info" });
        setIsSaving(false);
        return;
      }

      const sql = wrapInTransaction(statements);
      await executeQuery(sql);
      createNotification({
        text: `Saved ${statements.length} change${statements.length !== 1 ? "s" : ""}`,
        type: "success"
      });

      await fetchData(offset, pageSize, filters, sorts);
    } catch (err) {
      createNotification({
        title: "Save failed",
        text: err instanceof Error ? err.message : "Unknown error",
        type: "error"
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    currentData,
    originalDataByPk,
    newRowTempIds,
    tableColumns,
    primaryKeys,
    schema,
    table,
    executeQuery,
    fetchData,
    offset,
    pageSize,
    filters,
    sorts
  ]);

  const handleDataChange = useCallback((newData: Record<string, unknown>[]) => {
    setCurrentData(newData);
  }, []);

  // Use refs so the callback identity is stable (survives tableMeta useMemo)
  // while always reading the latest data.
  const currentDataRef = useRef(currentData);
  currentDataRef.current = currentData;
  const newRowTempIdsRef = useRef(newRowTempIds);
  newRowTempIdsRef.current = newRowTempIds;

  const getIsCellDirty = useCallback((rowIndex: number, columnId: string) => {
    const row = currentDataRef.current[rowIndex];
    if (!row) return false;
    if (row.tempRowId && newRowTempIdsRef.current.has(String(row.tempRowId))) return true;
    const pkMap = originalDataByPkRef.current;
    if (!pkMap) return false;
    const key = row.originalPkKey as string;
    if (!key) return false;
    const original = pkMap.get(key);
    if (!original) return false;
    return !cellValuesEqual(row[columnId], original[columnId]);
  }, []);

  // Stable row identity for TanStack Table
  const getRowId = useCallback(
    (row: Record<string, unknown>, index: number) => {
      if (row.tempRowId) return String(row.tempRowId);
      if (row.originalPkKey) return row.originalPkKey as string;
      if (primaryKeys.length > 0) return getRowKey(row, primaryKeys);
      return String(index);
    },
    [primaryKeys]
  );

  const syncSelectionCount = useCallback(() => {
    if (gridRef.current) {
      const { rows } = gridRef.current.getSelectedRowModel();
      setSelectedRowCount(rows.length);
      selectedRowsRef.current = rows.map((r) => r.original as Record<string, unknown>);
    }
  }, []);

  // Dice UI DataGrid
  const gridProps = useDataGrid<Record<string, unknown>>({
    data: currentData,
    columns: columnDefs,
    onDataChange: handleDataChange,
    getRowId,
    readOnly: !hasPrimaryKey,
    rowHeight: "short",
    enableSearch: true,
    enablePaste: hasPrimaryKey,
    onRowsDelete: hasPrimaryKey ? handleRowsDelete : undefined,
    meta: { onSelectionCountChange: syncSelectionCount, getIsCellDirty } as Record<string, unknown>
  });
  gridRef.current = gridProps.table;

  const handleDeleteSelected = useCallback(async () => {
    // Use the snapshot captured at selection time — by the time this click handler
    // fires, the DataGrid's outside-click listener has already cleared rowSelection.
    const rows = selectedRowsRef.current;
    if (rows.length === 0) return;

    const tempIdsToRemove: string[] = [];
    const deleteStatements: string[] = [];

    rows.forEach((row) => {
      const tempId = row.tempRowId ? String(row.tempRowId) : null;
      if (tempId) {
        tempIdsToRemove.push(tempId);
      } else {
        deleteStatements.push(
          buildDeleteQuery({ schema, table, primaryKeyMatch: getPkMatch(row, primaryKeys) })
        );
      }
    });

    // Remove unsaved new rows from local state immediately
    if (tempIdsToRemove.length > 0) {
      const tempIdSet = new Set(tempIdsToRemove);
      setCurrentData((prev) =>
        prev.filter((r) => !r.tempRowId || !tempIdSet.has(String(r.tempRowId)))
      );
      setNewRowTempIds((prev) => {
        const next = new Set(prev);
        tempIdsToRemove.forEach((id) => next.delete(id));
        return next;
      });
    }

    // Execute DELETE SQL for persisted rows
    if (deleteStatements.length > 0) {
      try {
        const sql = wrapInTransaction(deleteStatements);
        await executeQuery(sql);
        createNotification({
          text: `Deleted ${deleteStatements.length} row${deleteStatements.length !== 1 ? "s" : ""}`,
          type: "success"
        });
        const rowCount = await fetchData(offset, pageSize, filters, sorts);
        if (rowCount === 0 && offset > 0) {
          setOffset(Math.max(0, offset - pageSize));
        }
      } catch (err) {
        createNotification({
          title: "Delete failed",
          text: err instanceof Error ? err.message : "Unknown error",
          type: "error"
        });
      }
    }

    selectedRowsRef.current = [];
    setSelectedRowCount(0);
  }, [schema, table, primaryKeys, executeQuery, fetchData, offset, pageSize, filters, sorts]);

  if (!tableDetail) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Skeleton className="h-64 w-96" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <DataExplorerToolbar
        columns={tableColumns}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        sorts={sorts}
        onSortsChange={handleSortsChange}
        changeCount={changeCount}
        onSave={handleSave}
        onDiscard={handleDiscard}
        isSaving={isSaving}
        onAddRecord={handleAddRecord}
        hasNewRow={newRowTempIds.size > 0}
        selectedRowCount={selectedRowCount}
        onDeleteSelected={handleDeleteSelected}
        totalCount={totalCount}
        offset={offset}
        pageSize={pageSize}
        onOffsetChange={handleOffsetChange}
        onPageSizeChange={handlePageSizeChange}
        executionTimeMs={executionTimeMs}
        hasPrimaryKey={hasPrimaryKey}
        onRefresh={async () => {
          if (onFullRefresh) await onFullRefresh();
          await fetchData(offset, pageSize, filters, sorts);
        }}
        isRefreshing={isDataLoading && hasLoadedRef.current}
      />

      {!hasPrimaryKey && (
        <div className="border-b border-yellow-600/30 bg-yellow-950/20 px-3 py-1.5 text-xs text-yellow-400">
          This table has no primary key. Browsing is read-only — editing requires a primary key.
        </div>
      )}

      {/* Dice UI DataGrid */}
      <div className="data-explorer-grid flex flex-1 flex-col overflow-hidden font-mono text-foreground [--color-gray-200:var(--color-border)] [&_[data-slot=grid-footer]]:hidden [&_[data-slot=grid-header]]:bg-mineshaft-900 [&_[data-slot=grid]]:thin-scrollbar [&_[data-slot=grid]]:rounded-none [&_[data-slot=grid]]:border-0 [&_[data-slot=grid]]:bg-bunker-800">
        {isDataLoading && !hasLoadedRef.current && (
          <div className="space-y-1 p-4">
            {Array.from({ length: 10 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        )}
        {(!isDataLoading || hasLoadedRef.current) && (
          <DataGrid {...gridProps} className="min-h-0 flex-1" stretchColumns />
        )}
      </div>
    </div>
  );
};
