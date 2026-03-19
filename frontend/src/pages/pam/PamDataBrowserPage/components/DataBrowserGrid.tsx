import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { createNotification } from "@app/components/notifications";
import type { CellOpts } from "@app/components/v3/generic/DataGrid";
import { DataGrid, useDataGrid } from "@app/components/v3/generic/DataGrid";
import {
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyTitle
} from "@app/components/v3/generic/Empty";
import { Skeleton } from "@app/components/v3/generic/Skeleton";

import type { ColumnInfo, FieldInfo, TableDetail } from "../data-browser-types";
import type { FilterCondition, SortCondition } from "../sql-generation";
import {
  buildCountQuery,
  buildDeleteQuery,
  buildInsertQuery,
  buildSelectQuery,
  buildUpdateQuery,
  wrapInTransaction
} from "../sql-generation";
import { DataBrowserToolbar } from "./DataBrowserToolbar";

type DataBrowserGridProps = {
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
};

const ROW_KEY_PREFIX = "__new_";

function pgTypeToCellOpts(col: ColumnInfo): CellOpts {
  const t = col.type.toLowerCase();
  // Multi-line editing for large text/JSON fields
  if (t === "json" || t === "jsonb" || t === "text" || t === "xml") return { variant: "long-text" };
  // Everything else as plain text — SQL handles type coercion, backend validates
  return { variant: "short-text" };
}

function getColumnSize(col: ColumnInfo): number {
  const t = col.type.toLowerCase();
  if (t === "boolean" || t === "bool" || t === "smallint" || t === "int2") return 100;
  if (t === "integer" || t === "int4" || t === "serial") return 120;
  if (t === "uuid") return 280;
  if (t === "json" || t === "jsonb") return 250;
  if (t === "text" || t === "xml") return 220;
  // Scale with column name length as a rough heuristic
  return Math.max(140, Math.min(250, col.name.length * 10 + 80));
}

function buildColumnDefs(cols: ColumnInfo[]): ColumnDef<Record<string, unknown>>[] {
  return cols.map((col) => ({
    id: col.name,
    accessorKey: col.name,
    header: col.name,
    meta: {
      label: col.name,
      typeLabel: col.type,
      cell: pgTypeToCellOpts(col)
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

export const DataBrowserGrid = ({
  tableDetail,
  schema,
  table,
  executeQuery,
  isLoading
}: DataBrowserGridProps) => {
  const [originalData, setOriginalData] = useState<Record<string, unknown>[]>([]);
  const [currentData, setCurrentData] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [sorts, setSorts] = useState<SortCondition[]>([]);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [deletedRowKeys, setDeletedRowKeys] = useState<Set<string>>(new Set());
  const [newRowTempIds, setNewRowTempIds] = useState<Set<string>>(new Set());
  const [containerHeight, setContainerHeight] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);
  const newRowCounterRef = useRef(0);
  const hasLoadedRef = useRef(false);

  const primaryKeys = tableDetail?.primaryKeys ?? [];
  const tableColumns = tableDetail?.columns ?? [];
  const hasPrimaryKey = primaryKeys.length > 0;

  // Measure container height for the virtualized grid
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        setContainerHeight(entry.contentRect.height);
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Build TanStack Table column definitions from PG metadata
  const columnDefs = useMemo(() => buildColumnDefs(tableColumns), [tableColumns]);

  const fetchData = useCallback(
    async (p: number, ps: number, f: FilterCondition[], s: SortCondition[]) => {
      if (!tableDetail) return;
      setIsDataLoading(true);
      try {
        const selectSql = buildSelectQuery({
          schema,
          table,
          filters: f,
          sorts: s,
          limit: ps,
          offset: (p - 1) * ps,
          primaryKeys
        });
        const countSql = buildCountQuery({ schema, table, filters: f });

        const [dataResult, countResult] = await Promise.all([
          executeQuery(selectSql),
          executeQuery(countSql)
        ]);

        setOriginalData(dataResult.rows);
        setCurrentData(dataResult.rows);
        setExecutionTimeMs(dataResult.executionTimeMs);
        setTotalCount(Number(countResult.rows[0]?.count ?? 0));
        setDeletedRowKeys(new Set());
        setNewRowTempIds(new Set());
        hasLoadedRef.current = true;
      } catch (err) {
        createNotification({
          title: "Failed to load data",
          text: err instanceof Error ? err.message : "Unknown error",
          type: "error"
        });
      } finally {
        setIsDataLoading(false);
      }
    },
    [tableDetail, schema, table, primaryKeys, executeQuery]
  );

  // Fetch data when table/filters/sorts/pagination change
  const prevFetchKeyRef = useRef("");
  const prevTableKeyRef = useRef("");
  const tableKey = `${schema}.${table}`;
  const fetchKey = `${tableKey}.${page}.${pageSize}.${JSON.stringify(filters)}.${JSON.stringify(sorts)}`;
  if (fetchKey !== prevFetchKeyRef.current && tableDetail && !isLoading) {
    // Reset hasLoaded when switching to a different table so skeleton shows for initial load
    if (tableKey !== prevTableKeyRef.current) {
      hasLoadedRef.current = false;
      prevTableKeyRef.current = tableKey;
    }
    prevFetchKeyRef.current = fetchKey;
    fetchData(page, pageSize, filters, sorts);
  }

  const handleFiltersChange = useCallback((newFilters: FilterCondition[]) => {
    setFilters(newFilters);
    setPage(1);
  }, []);

  const handleSortsChange = useCallback((newSorts: SortCondition[]) => {
    setSorts(newSorts);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const handlePageSizeChange = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  }, []);

  // Change tracking
  const changeCount = useMemo(() => {
    let count = newRowTempIds.size + deletedRowKeys.size;
    currentData.forEach((row) => {
      const key = row.tempRowId ? String(row.tempRowId) : getRowKey(row, primaryKeys);
      if (newRowTempIds.has(key) || deletedRowKeys.has(key)) return;
      const original = originalData.find((o) => getRowKey(o, primaryKeys) === key);
      if (!original) return;
      const hasChanges = tableColumns.some(
        (col) => String(row[col.name] ?? "") !== String(original[col.name] ?? "")
      );
      if (hasChanges) count += 1;
    });
    return count;
  }, [currentData, originalData, newRowTempIds, deletedRowKeys, primaryKeys, tableColumns]);

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
    (_rows: Record<string, unknown>[], rowIndices: number[]) => {
      const keysToDelete: string[] = [];
      rowIndices.forEach((idx) => {
        const row = currentData[idx];
        if (!row) return;
        const tempId = row.tempRowId ? String(row.tempRowId) : null;
        const rowKey = tempId ?? getRowKey(row, primaryKeys);
        keysToDelete.push(rowKey);
      });
      setDeletedRowKeys((prev) => {
        const next = new Set(prev);
        keysToDelete.forEach((key) => next.add(key));
        return next;
      });
    },
    [currentData, primaryKeys]
  );

  const handleDiscard = useCallback(() => {
    setCurrentData(originalData);
    setDeletedRowKeys(new Set());
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

      // Updates (changed rows)
      currentData.forEach((row) => {
        if (row.tempRowId) return;
        const key = getRowKey(row, primaryKeys);
        if (deletedRowKeys.has(key)) return;
        const original = originalData.find((o) => getRowKey(o, primaryKeys) === key);
        if (!original) return;
        const changes: Record<string, unknown> = {};
        tableColumns.forEach((col) => {
          if (String(row[col.name] ?? "") !== String(original[col.name] ?? "")) {
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

      // Deletes
      deletedRowKeys.forEach((key) => {
        if (key.startsWith(ROW_KEY_PREFIX)) return;
        const pkMatch = JSON.parse(key) as Record<string, unknown>;
        statements.push(buildDeleteQuery({ schema, table, primaryKeyMatch: pkMatch }));
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

      await fetchData(page, pageSize, filters, sorts);
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
    originalData,
    newRowTempIds,
    deletedRowKeys,
    tableColumns,
    primaryKeys,
    schema,
    table,
    executeQuery,
    fetchData,
    page,
    pageSize,
    filters,
    sorts
  ]);

  const handleDataChange = useCallback((newData: Record<string, unknown>[]) => {
    setCurrentData(newData);
  }, []);

  // Stable row identity for TanStack Table
  const getRowId = useCallback(
    (row: Record<string, unknown>, index: number) => {
      if (row.tempRowId) return String(row.tempRowId);
      if (primaryKeys.length > 0) return getRowKey(row, primaryKeys);
      return String(index);
    },
    [primaryKeys]
  );

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
    onRowsDelete: hasPrimaryKey ? handleRowsDelete : undefined
  });

  if (isLoading || !tableDetail) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Skeleton className="h-64 w-96" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <DataBrowserToolbar
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
        selectedRowCount={0}
        onDeleteSelected={() => {}}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        executionTimeMs={executionTimeMs}
        hasPrimaryKey={hasPrimaryKey}
        onRefresh={() => fetchData(page, pageSize, filters, sorts)}
        isRefreshing={isDataLoading && hasLoadedRef.current}
      />

      {!hasPrimaryKey && (
        <div className="border-b border-yellow-600/30 bg-yellow-950/20 px-3 py-1.5 text-xs text-yellow-400">
          This table has no primary key. Browsing is read-only — editing requires a primary key.
        </div>
      )}

      {/* Dice UI DataGrid */}
      <div
        ref={containerRef}
        className="data-browser-grid flex-1 overflow-hidden text-foreground [--color-gray-200:var(--color-border)] [&_[data-slot=grid-footer]]:hidden [&_[data-slot=grid-header]]:bg-mineshaft-900 [&_[data-slot=grid]]:thin-scrollbar [&_[data-slot=grid]]:rounded-none [&_[data-slot=grid]]:border-0 [&_[data-slot=grid]]:bg-bunker-800"
      >
        {isDataLoading && !hasLoadedRef.current && (
          <div className="space-y-1 p-4">
            {Array.from({ length: 10 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        )}
        {!isDataLoading && currentData.length === 0 && (
          <UnstableEmpty className="py-16">
            <UnstableEmptyTitle>No data</UnstableEmptyTitle>
            <UnstableEmptyDescription>
              {filters.length > 0 ? "No rows match the current filters" : "This table is empty"}
            </UnstableEmptyDescription>
          </UnstableEmpty>
        )}
        {currentData.length > 0 && (
          <DataGrid {...gridProps} height={containerHeight} stretchColumns />
        )}
      </div>
    </div>
  );
};
