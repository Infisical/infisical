import { useCallback, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { Spinner } from "@app/components/v2";
import { DataGrid, useDataGrid } from "@app/components/v3/generic/DataGrid";

import type { FieldInfo, ForeignKeyInfo, TableDetail } from "../data-explorer-types";
import { getColumnIndicator } from "../data-explorer-utils";

type QueryResult = {
  rows: Record<string, unknown>[];
  fields: FieldInfo[];
  rowCount: number | null;
  isTruncated: boolean;
  command: string;
  executionTimeMs: number;
};

type Props = {
  result: QueryResult | null;
  error: string | null;
  isRunning: boolean;
  tableDetail: TableDetail | null;
};

type RowData = Record<string, unknown>;

function buildColumns(fields: FieldInfo[], tableDetail: TableDetail | null): ColumnDef<RowData>[] {
  const colTypeMap = new Map<string, string>();
  const primaryKeys: string[] = [];
  const fkMap = new Map<string, ForeignKeyInfo>();

  if (tableDetail) {
    tableDetail.columns.forEach((c) => colTypeMap.set(c.name, c.type));
    tableDetail.primaryKeys.forEach((pk) => primaryKeys.push(pk));
    tableDetail.foreignKeys.forEach((fk) => {
      fk.columns.forEach((c) => {
        if (!fkMap.has(c)) fkMap.set(c, fk);
      });
    });
  }

  return fields.map((f) => {
    const typeLabel = colTypeMap.get(f.name);
    const columnIndicator = tableDetail
      ? getColumnIndicator(f.name, primaryKeys, fkMap)
      : undefined;
    return {
      id: f.name,
      accessorKey: f.name,
      header: f.name,
      meta: {
        label: f.name,
        ...(typeLabel ? { typeLabel } : {}),
        ...(columnIndicator ? { columnIndicator } : {}),
        cell: { variant: "short-text" as const }
      },
      enableSorting: true,
      enablePinning: true,
      enableHiding: true
    };
  });
}

function ResultsGrid({
  result,
  tableDetail
}: {
  result: QueryResult;
  tableDetail: TableDetail | null;
}) {
  const { isTruncated } = result;

  const columns = useMemo(
    () => buildColumns(result.fields, tableDetail),
    [result.fields, tableDetail]
  );

  const getRowId = useCallback((_row: RowData, index: number) => String(index), []);

  const gridProps = useDataGrid<RowData>({
    data: result.rows,
    columns,
    getRowId,
    readOnly: true,
    rowHeight: "short",
    enableSearch: true
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="data-explorer-grid relative flex min-h-0 flex-1 flex-col overflow-hidden font-mono text-foreground [--color-gray-200:var(--color-border)] [&_[data-slot=grid-footer]]:hidden [&_[data-slot=grid-header]]:bg-container [&_[data-slot=grid]]:thin-scrollbar [&_[data-slot=grid]]:rounded-none [&_[data-slot=grid]]:border-0 [&_[data-slot=grid]]:bg-bunker-800">
        <DataGrid {...gridProps} className="min-h-0 flex-1" stretchColumns />
      </div>
      {isTruncated && (
        <div className="shrink-0 border-t border-mineshaft-600 bg-mineshaft-800 px-3 py-1.5 text-xs text-yellow-500/80">
          Showing first {result.rows.length.toLocaleString()} rows (results truncated)
        </div>
      )}
    </div>
  );
}

export function QueryResultsTable({ result, error, isRunning, tableDetail }: Props) {
  if (isRunning) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 font-mono text-xs whitespace-pre-wrap text-red-400">
          {error}
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-mineshaft-500">Run a query to see results</p>
      </div>
    );
  }

  if (result.rows.length === 0) {
    const cmdUpper = result.command.toUpperCase();
    const count = result.rowCount ?? 0;
    const verb: Record<string, string> = {
      INSERT: "inserted",
      UPDATE: "updated",
      DELETE: "deleted"
    };
    const staticMessage: Record<string, string> = {
      BEGIN: "Transaction started",
      COMMIT: "Transaction committed",
      ROLLBACK: "Transaction rolled back"
    };

    const isMutation = verb[cmdUpper] !== undefined && result.fields.length === 0;

    let message: string;
    if (staticMessage[cmdUpper]) {
      message = staticMessage[cmdUpper];
    } else if (isMutation) {
      message = `${count} row${count !== 1 ? "s" : ""} ${verb[cmdUpper]}`;
    } else {
      message = "No rows returned";
    }

    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <span className="rounded bg-mineshaft-700 px-3 py-1.5 font-mono text-sm text-mineshaft-200">
          {message}
          {isMutation && <span className="ml-2 text-mineshaft-400">· No rows returned</span>}
        </span>
      </div>
    );
  }

  return <ResultsGrid result={result} tableDetail={tableDetail} />;
}
