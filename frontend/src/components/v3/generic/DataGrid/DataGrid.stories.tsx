import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CellContext, ColumnDef, HeaderContext } from "@tanstack/react-table";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  UndoIcon
} from "lucide-react";

import { Alert, AlertDescription } from "../Alert";
import { Button } from "../Button";
import { Checkbox } from "../Checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "../Popover";
import { DataGrid } from "./data-grid";
import { useDataGrid } from "./use-data-grid";

type RowData = Record<string, unknown> & {
  originalPkKey?: string;
  tempRowId?: string;
};

type ColumnInfo = {
  name: string;
  type: string;
};

type ForeignKeyInfo = {
  columns: string[];
  targetSchema: string;
  targetTable: string;
  targetColumns: string[];
};

const DATA_EXPLORER_GRID_CLASS =
  "data-explorer-grid relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden font-mono text-foreground [--color-gray-200:var(--color-border)] [&_[data-slot=grid-footer]]:hidden [&_[data-slot=grid-header]]:bg-container [&_[data-slot=grid]]:thin-scrollbar [&_[data-slot=grid]]:rounded-none [&_[data-slot=grid]]:border-0 [&_[data-slot=grid]]:bg-background";

const USERS_COLUMNS: ColumnInfo[] = [
  { name: "id", type: "uuid" },
  { name: "org_id", type: "uuid" },
  { name: "email", type: "text" },
  { name: "role", type: "text" },
  { name: "is_active", type: "bool" },
  { name: "created_at", type: "timestamptz" }
];

const USERS_PRIMARY_KEYS = ["id"];

const USERS_FOREIGN_KEYS: ForeignKeyInfo[] = [
  {
    columns: ["org_id"],
    targetSchema: "public",
    targetTable: "organizations",
    targetColumns: ["id"]
  }
];

const QUERY_FIELDS = USERS_COLUMNS.map((col) => ({ name: col.name }));

const ROW_KEY_PREFIX = "__new_";

function cellValuesEqual(a: unknown, b: unknown): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return String(a) === String(b);
}

function getColumnSize(col: ColumnInfo, hasIndicator: boolean): number {
  const indicatorExtra = hasIndicator ? 40 : 0;
  const t = col.type.toLowerCase();
  if (t === "boolean" || t === "bool" || t === "smallint" || t === "int2")
    return 100 + indicatorExtra;
  if (t === "integer" || t === "int4" || t === "serial") return 120 + indicatorExtra;
  if (t === "uuid") return 280 + indicatorExtra;
  if (t === "json" || t === "jsonb") return 250 + indicatorExtra;
  if (t === "text" || t === "xml") return 220 + indicatorExtra;
  return Math.max(180, Math.min(350, col.name.length * 10 + 120)) + indicatorExtra;
}

function getColumnIndicator(
  colName: string,
  primaryKeys: string[],
  fkMap: Map<string, ForeignKeyInfo>
): { type: "pk" | "fk"; tooltip?: string } | undefined {
  if (primaryKeys.includes(colName)) return { type: "pk" };
  const fk = fkMap.get(colName);
  if (!fk) return undefined;
  const targetCol = fk.targetColumns[fk.columns.indexOf(colName)] ?? fk.targetColumns[0];
  return { type: "fk", tooltip: `\u2192 ${fk.targetSchema}.${fk.targetTable}(${targetCol})` };
}

function getRowKey(row: RowData, primaryKeys: string[]): string {
  const keyObj: Record<string, unknown> = {};
  primaryKeys.forEach((pk) => {
    keyObj[pk] = row[pk];
  });
  return JSON.stringify(keyObj);
}

function createUserRow(index: number): RowData {
  const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  const orgId =
    index % 3 === 0
      ? "11111111-1111-4111-8111-111111111111"
      : "22222222-2222-4222-8222-222222222222";
  let role = "member";
  if (index % 5 === 0) role = "admin";
  else if (index % 3 === 0) role = "viewer";
  return {
    id,
    org_id: orgId,
    email: `user-${index}@acme.example`,
    role,
    is_active: index % 7 !== 0,
    created_at: `2026-${String((index % 12) + 1).padStart(2, "0")}-15 12:04:00+00`
  };
}

const ALL_USERS = Array.from({ length: 120 }, (_, i) => createUserRow(i + 1));

function SelectHeader({ table: t }: HeaderContext<RowData, unknown>) {
  const isAllSelected = t.getIsAllRowsSelected();
  const isSomeSelected = t.getIsSomeRowsSelected();
  return (
    <Checkbox
      isChecked={isAllSelected || isSomeSelected}
      isIndeterminate={isSomeSelected && !isAllSelected}
      onCheckedChange={() => {
        t.toggleAllRowsSelected(!isAllSelected);
      }}
    />
  );
}

function SelectCell({ row }: CellContext<RowData, unknown>) {
  const isSelected = row.getIsSelected();
  return (
    <Checkbox
      isChecked={isSelected}
      onCheckedChange={(checked) => {
        row.toggleSelected(Boolean(checked));
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

function buildQueryColumns(fields: Array<{ name: string }>): ColumnDef<RowData>[] {
  return fields.map((f) => ({
    id: f.name,
    accessorKey: f.name,
    header: f.name,
    meta: {
      label: f.name,
      cell: { variant: "short-text" as const }
    },
    enableSorting: true,
    enablePinning: true,
    enableHiding: true
  }));
}

function buildTableColumns(
  cols: ColumnInfo[],
  primaryKeys: string[],
  foreignKeys: ForeignKeyInfo[]
): ColumnDef<RowData>[] {
  const fkMap = new Map<string, ForeignKeyInfo>();
  foreignKeys.forEach((fk) => {
    fk.columns.forEach((c) => {
      if (!fkMap.has(c)) fkMap.set(c, fk);
    });
  });

  return cols.map((col) => {
    const columnIndicator = getColumnIndicator(col.name, primaryKeys, fkMap);
    return {
      id: col.name,
      accessorKey: col.name,
      header: col.name,
      meta: {
        label: col.name,
        typeLabel: col.type,
        cell: { variant: "short-text" as const },
        columnIndicator
      },
      size: getColumnSize(col, Boolean(columnIndicator)),
      minSize: 80,
      maxSize: 600,
      enableSorting: true,
      enablePinning: true,
      enableHiding: true
    };
  });
}

function ExplorerShell({ children }: { children: ReactNode }) {
  return (
    <div className="ms-0 flex h-[28rem] w-full max-w-full min-w-0 flex-col overflow-hidden border border-border bg-background">
      {children}
    </div>
  );
}

function ExplorerGrid({ children }: { children: ReactNode }) {
  return <div className={DATA_EXPLORER_GRID_CLASS}>{children}</div>;
}

/**
 * `DataGrid` is the v3 spreadsheet primitive. Compose it from `useDataGrid`
 * (focus, selection, search, paste, cell edits) plus
 * `<DataGrid {...gridProps} />`.
 *
 * **The only production consumer is the PAM data explorer.** Do not reach for
 * this on ordinary management lists — members, identities, audit logs, and the
 * secrets overview belong on `Table`. Use `DataGrid` when the interaction is
 * Excel-like: cell focus, range selection, copy / cut / paste, and find-in-grid.
 *
 * Both PAM mounts share one chrome wrapper: `font-mono`, flush (no grid border
 * or radius), header on `--color-container`, footer hidden (`onRowAdd` is not
 * used; add-row lives on the toolbar). `stretchColumns` is always on.
 * `rowHeight` is always `"short"`. Every column is `meta.cell: { variant:
 * "short-text" }` — Postgres types are shown as `typeLabel`, not as typed
 * editors.
 *
 * Anchor the grid on the start edge. Extra column width grows toward the end
 * and scrolls inside the panel (`overflow-x`); do not center the sheet so it
 * grows both ways. Stories use `layout: "padded"` for that reason.
 *
 * Column pinning is TanStack state, not a header or context-menu control. Pass
 * `initialState.columnPinning` (or `column.pin(...)`) — see *Example: Pinned
 * Columns*. PAM sets `enablePinning: true` on data columns but does not pin any.
 *
 * The two call sites:
 * - **Query results** (`QueryResultsTable`) — `readOnly`, `enableSearch`, no
 *   select column. Empty / error / truncated are siblings, not grid states.
 * - **Table browser** (`DataExplorerGrid`) — `onDataChange`, `enablePaste` and
 *   `onRowsDelete` when a primary key exists, a checkbox `select` column,
 *   PK/FK `columnIndicator`, dirty/new-row meta, and a toolbar for add / bulk
 *   delete / save / offset paging. Tables without a PK stay read-only behind
 *   an info `Alert`.
 */
const meta = {
  title: "Generic/DataGrid",
  component: DataGrid,
  parameters: {
    layout: "padded"
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="ms-0 w-full max-w-full min-w-0">
        <Story />
      </div>
    )
  ]
} satisfies Meta;

export default meta;
type Story = StoryObj;

function QueryResultsGrid({
  rows,
  isTruncated = false
}: {
  rows: RowData[];
  isTruncated?: boolean;
}) {
  const columns = useMemo(() => buildQueryColumns(QUERY_FIELDS), []);
  const getRowId = useCallback((_row: RowData, index: number) => String(index), []);
  const gridProps = useDataGrid<RowData>({
    data: rows,
    columns,
    getRowId,
    readOnly: true,
    rowHeight: "short",
    enableSearch: true
  });

  return (
    <ExplorerShell>
      <ExplorerGrid>
        <DataGrid {...gridProps} className="min-h-0 flex-1" stretchColumns />
      </ExplorerGrid>
      {isTruncated && (
        <div className="shrink-0 border-t border-border bg-card px-3 py-1.5 text-xs text-warning/80">
          Showing first {rows.length.toLocaleString()} rows (results truncated)
        </div>
      )}
    </ExplorerShell>
  );
}

export const QueryResults: Story = {
  name: "Example: Query Results",
  parameters: {
    docs: {
      description: {
        story:
          "PAM `QueryResultsTable`. Read-only `short-text` columns from the result field list, `enableSearch` (`⌘/Ctrl+F`), `stretchColumns`, and the explorer chrome (mono, flush, hidden footer). Double-click does not edit."
      }
    }
  },
  render: () => <QueryResultsGrid rows={ALL_USERS.slice(0, 40)} />
};

export const QueryNoRows: Story = {
  name: "State: No Rows Returned",
  parameters: {
    docs: {
      description: {
        story:
          "When a query returns zero rows, PAM does not render a `DataGrid`. `QueryResultsTable` swaps in a centered monospace chip (`No rows returned`, or a mutation count like `3 rows deleted`). `Empty` is not used here."
      }
    }
  },
  render: () => (
    <ExplorerShell>
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <span className="rounded border-2 border-border bg-container px-3 py-1.5 font-mono text-sm text-foreground">
          No rows returned
        </span>
      </div>
    </ExplorerShell>
  )
};

export const QueryError: Story = {
  name: "State: Query Error",
  parameters: {
    docs: {
      description: {
        story:
          "A failed query is a bordered danger box of the Postgres error text — not a grid empty state. Copied from `QueryResultsTable`."
      }
    }
  },
  render: () => (
    <ExplorerShell>
      <div className="p-4">
        <div className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 font-mono text-xs whitespace-pre-wrap text-danger">
          {`ERROR:  column "emial" does not exist
LINE 1: SELECT emial FROM public.users;
               ^`}
        </div>
      </div>
    </ExplorerShell>
  )
};

export const QueryTruncated: Story = {
  name: "State: Truncated Results",
  parameters: {
    docs: {
      description: {
        story:
          "When the backend truncates a result set, the grid still renders the returned rows and a warning banner sits under it: `Showing first N rows (results truncated)`."
      }
    }
  },
  render: () => <QueryResultsGrid rows={ALL_USERS.slice(0, 40)} isTruncated />
};

function LimitOffsetPopover({
  totalCount,
  rangeStart,
  rangeEnd,
  pageSize,
  offset,
  onPageSizeChange,
  onOffsetChange
}: {
  totalCount: number;
  rangeStart: number;
  rangeEnd: number;
  pageSize: number;
  offset: number;
  onPageSizeChange: (size: number) => void;
  onOffsetChange: (offset: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [limitInput, setLimitInput] = useState(String(pageSize));
  const [offsetInput, setOffsetInput] = useState(String(offset));

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setLimitInput(String(pageSize));
      setOffsetInput(String(offset));
    }
    setOpen(isOpen);
  };

  const limitNum = Number(limitInput);
  const offsetNum = Number(offsetInput);
  const getLimitError = (): string | null => {
    if (limitInput === "" || Number.isNaN(limitNum)) return "Must be a number";
    if (limitNum < 1) return "Minimum is 1";
    if (limitNum > 1000) return "Maximum is 1000";
    return null;
  };
  const getOffsetError = (): string | null => {
    if (offsetInput === "" || Number.isNaN(offsetNum)) return "Must be a number";
    if (offsetNum < 0) return "Must be 0 or greater";
    return null;
  };
  const limitError = getLimitError();
  const offsetError = getOffsetError();

  const applyChanges = () => {
    if (limitError || offsetError) return;
    onPageSizeChange(Math.max(1, Math.min(1000, limitNum || 50)));
    onOffsetChange(Math.max(0, offsetNum || 0));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" className="text-muted">
          {rangeStart} - {rangeEnd} of {totalCount}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="center">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-medium text-accent">Limit</span>
              <input
                type="number"
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyChanges()}
                className={`h-8 w-16 rounded border bg-transparent text-center text-sm text-foreground outline-none ${
                  limitError
                    ? "border-danger focus:border-danger"
                    : "border-border focus:border-ring"
                }`}
                min={1}
              />
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-medium text-accent">Offset</span>
              <input
                type="number"
                value={offsetInput}
                onChange={(e) => setOffsetInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyChanges()}
                className={`h-8 w-16 rounded border bg-transparent text-center text-sm text-foreground outline-none ${
                  offsetError
                    ? "border-danger focus:border-danger"
                    : "border-border focus:border-ring"
                }`}
                min={0}
              />
            </div>
          </div>
          {(limitError || offsetError) && (
            <p className="text-center text-[10px] text-danger">{limitError || offsetError}</p>
          )}
          <Button
            variant="outline"
            size="xs"
            onClick={applyChanges}
            disabled={Boolean(limitError || offsetError)}
            className="w-full"
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TableBrowser({ hasPrimaryKey }: { hasPrimaryKey: boolean }) {
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [sourceRows, setSourceRows] = useState(ALL_USERS);
  const [currentData, setCurrentData] = useState<RowData[]>(() =>
    ALL_USERS.slice(0, 50).map((row) => ({
      ...row,
      originalPkKey: getRowKey(row, USERS_PRIMARY_KEYS)
    }))
  );
  const [originalData, setOriginalData] = useState(currentData);
  const [newRowTempIds, setNewRowTempIds] = useState<Set<string>>(new Set());
  const [selectedRowCount, setSelectedRowCount] = useState(0);
  const newRowCounterRef = useRef(0);
  const selectedRowsRef = useRef<RowData[]>([]);
  const gridRef = useRef<ReturnType<typeof useDataGrid<RowData>>["table"] | null>(null);

  const applyPage = useCallback((rows: RowData[], nextOffset: number, nextPageSize: number) => {
    const page = rows.slice(nextOffset, nextOffset + nextPageSize).map((row) => ({
      ...row,
      originalPkKey: getRowKey(row, USERS_PRIMARY_KEYS)
    }));
    setCurrentData(page);
    setOriginalData(page);
    setNewRowTempIds(new Set());
    setSelectedRowCount(0);
    selectedRowsRef.current = [];
  }, []);

  const columnDefs = useMemo(
    () =>
      hasPrimaryKey
        ? [
            SELECT_COLUMN,
            ...buildTableColumns(USERS_COLUMNS, USERS_PRIMARY_KEYS, USERS_FOREIGN_KEYS)
          ]
        : buildTableColumns(USERS_COLUMNS, [], []),
    [hasPrimaryKey]
  );

  const originalDataByPk = useMemo(() => {
    const map = new Map<string, RowData>();
    originalData.forEach((row) => {
      map.set(String(row.originalPkKey), row);
    });
    return map;
  }, [originalData]);

  const originalDataByPkRef = useRef(originalDataByPk);
  originalDataByPkRef.current = originalDataByPk;
  const currentDataRef = useRef(currentData);
  currentDataRef.current = currentData;
  const newRowTempIdsRef = useRef(newRowTempIds);
  newRowTempIdsRef.current = newRowTempIds;

  const changeCount = useMemo(() => {
    let count = newRowTempIds.size;
    currentData.forEach((row) => {
      if (row.tempRowId && newRowTempIds.has(String(row.tempRowId))) return;
      const original = originalDataByPk.get(String(row.originalPkKey));
      if (!original) return;
      const hasChanges = USERS_COLUMNS.some(
        (col) => !cellValuesEqual(row[col.name], original[col.name])
      );
      if (hasChanges) count += 1;
    });
    return count;
  }, [currentData, originalDataByPk, newRowTempIds]);

  const getRowId = useCallback((row: RowData, index: number) => {
    if (row.tempRowId) return String(row.tempRowId);
    if (row.originalPkKey) return String(row.originalPkKey);
    return String(index);
  }, []);

  const getIsCellDirty = useCallback((rowIndex: number, columnId: string) => {
    const row = currentDataRef.current[rowIndex];
    if (!row) return false;
    if (row.tempRowId && newRowTempIdsRef.current.has(String(row.tempRowId))) return true;
    const original = originalDataByPkRef.current.get(String(row.originalPkKey));
    if (!original) return false;
    return !cellValuesEqual(row[columnId], original[columnId]);
  }, []);

  const getIsRowNew = useCallback((rowIndex: number) => {
    const row = currentDataRef.current[rowIndex];
    if (!row) return false;
    return Boolean(row.tempRowId && newRowTempIdsRef.current.has(String(row.tempRowId)));
  }, []);

  const handleAddRecord = useCallback(() => {
    newRowCounterRef.current += 1;
    const tempId = `${ROW_KEY_PREFIX}${newRowCounterRef.current}`;
    const newRow: RowData = { tempRowId: tempId };
    USERS_COLUMNS.forEach((col) => {
      newRow[col.name] = null;
    });
    setCurrentData((prev) => [newRow, ...prev]);
    setNewRowTempIds((prev) => new Set(prev).add(tempId));
  }, []);

  const handleRowsDelete = useCallback((_rows: RowData[], rowIndices: number[]) => {
    const remove = new Set(rowIndices);
    setCurrentData((prev) => prev.filter((_, index) => !remove.has(index)));
  }, []);

  const handleDeleteSelected = useCallback(() => {
    const rows = selectedRowsRef.current;
    if (rows.length === 0) return;
    const tempIds = new Set(
      rows.filter((row) => row.tempRowId).map((row) => String(row.tempRowId))
    );
    const persistedKeys = new Set(
      rows.filter((row) => !row.tempRowId).map((row) => String(row.originalPkKey))
    );
    setCurrentData((prev) =>
      prev.filter((row) => {
        if (row.tempRowId) return !tempIds.has(String(row.tempRowId));
        return !persistedKeys.has(String(row.originalPkKey));
      })
    );
    setSourceRows((prev) =>
      prev.filter((row) => !persistedKeys.has(getRowKey(row, USERS_PRIMARY_KEYS)))
    );
    setNewRowTempIds((prev) => {
      const next = new Set(prev);
      tempIds.forEach((id) => next.delete(id));
      return next;
    });
    gridRef.current?.resetRowSelection();
    selectedRowsRef.current = [];
    setSelectedRowCount(0);
  }, []);

  const handleSave = useCallback(() => {
    const kept = currentData.filter((row) => {
      if (row.tempRowId) return newRowTempIds.has(String(row.tempRowId));
      return true;
    });
    const committed = kept.map((row) => {
      const next = { ...row };
      delete next.tempRowId;
      next.originalPkKey = getRowKey(next, USERS_PRIMARY_KEYS);
      return next;
    });
    setCurrentData(committed);
    setOriginalData(committed);
    setNewRowTempIds(new Set());
  }, [currentData, newRowTempIds]);

  const handleDiscard = useCallback(() => {
    setCurrentData(originalData);
    setNewRowTempIds(new Set());
  }, [originalData]);

  const gridProps = useDataGrid<RowData>({
    data: currentData,
    columns: columnDefs,
    onDataChange: setCurrentData,
    getRowId,
    readOnly: !hasPrimaryKey,
    rowHeight: "short",
    enableSearch: true,
    enablePaste: hasPrimaryKey,
    onRowsDelete: hasPrimaryKey ? handleRowsDelete : undefined,
    onRowSelectionChange: (rowSelection) => {
      const selectedIds = new Set(Object.keys(rowSelection).filter((k) => rowSelection[k]));
      setSelectedRowCount(selectedIds.size);
      selectedRowsRef.current =
        selectedIds.size > 0
          ? currentData.filter((_row, idx) => selectedIds.has(getRowId(_row, idx)))
          : [];
    },
    meta: { getIsCellDirty, getIsRowNew } as Record<string, unknown>
  });
  gridRef.current = gridProps.table;

  const totalCount = sourceRows.length;
  const rangeStart = totalCount === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + pageSize, totalCount);

  return (
    <ExplorerShell>
      <div
        role="toolbar"
        data-grid-popover=""
        className="flex items-center justify-between border-b border-border px-3 py-1.5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          {hasPrimaryKey && (
            <Button variant="outline" size="xs" onClick={handleAddRecord} className="gap-1">
              <PlusIcon className="size-3" />
              Add record
            </Button>
          )}
          {selectedRowCount > 0 && hasPrimaryKey && (
            <Button variant="danger" size="xs" onClick={handleDeleteSelected} className="gap-1">
              <Trash2Icon className="size-3" />
              Delete {selectedRowCount} record{selectedRowCount !== 1 ? "s" : ""}
            </Button>
          )}
          {changeCount > 0 && (
            <>
              <div className="h-4 w-px bg-border" />
              <Button variant="success" size="xs" onClick={handleSave} className="gap-1">
                <SaveIcon className="size-3" />
                Save {changeCount} change{changeCount !== 1 ? "s" : ""}
              </Button>
              <Button variant="ghost" size="xs" onClick={handleDiscard} className="gap-1 underline">
                <UndoIcon className="size-3" />
                Discard changes
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="xs"
            disabled={offset <= 0}
            onClick={() => {
              const next = Math.max(0, offset - pageSize);
              setOffset(next);
              applyPage(sourceRows, next, pageSize);
            }}
            className="size-7 p-0"
          >
            <ChevronLeftIcon className="size-3.5" />
          </Button>
          <LimitOffsetPopover
            totalCount={totalCount}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            pageSize={pageSize}
            offset={offset}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setOffset(0);
              applyPage(sourceRows, 0, size);
            }}
            onOffsetChange={(next) => {
              setOffset(next);
              applyPage(sourceRows, next, pageSize);
            }}
          />
          <Button
            variant="ghost"
            size="xs"
            disabled={offset + pageSize >= totalCount}
            onClick={() => {
              const next = offset + pageSize;
              setOffset(next);
              applyPage(sourceRows, next, pageSize);
            }}
            className="size-7 p-0"
          >
            <ChevronRightIcon className="size-3.5" />
          </Button>
        </div>
      </div>
      {!hasPrimaryKey && (
        <div className="shrink-0 px-3 py-3">
          <Alert variant="info" className="py-2">
            <EyeIcon />
            <AlertDescription>
              This table has no primary key. Browsing is read-only — editing requires a primary key.
            </AlertDescription>
          </Alert>
        </div>
      )}
      <ExplorerGrid>
        <DataGrid {...gridProps} className="min-h-0 flex-1" stretchColumns />
      </ExplorerGrid>
    </ExplorerShell>
  );
}

export const TableBrowserEditable: Story = {
  name: "Example: Table Browser",
  parameters: {
    docs: {
      description: {
        story:
          "PAM `DataExplorerGrid` when the table has a primary key. Checkbox select column, PK/FK badges and type labels, `enablePaste`, dirty-cell tracking, toolbar Add record (the grid footer is CSS-hidden), bulk delete, save / discard, and limit/offset paging. Production also mounts filter / sort / export / refresh on `DataExplorerToolbar`; those are page-local, not DataGrid."
      }
    }
  },
  render: () => <TableBrowser hasPrimaryKey />
};

export const TableBrowserReadOnly: Story = {
  name: "State: No Primary Key",
  parameters: {
    docs: {
      description: {
        story:
          "A table (or view) without a primary key is `readOnly`. PAM shows the info `Alert` above the same explorer chrome and omits Add record, paste, and row delete."
      }
    }
  },
  render: () => <TableBrowser hasPrimaryKey={false} />
};

const PINNED_DEMO_COLUMNS: ColumnInfo[] = [
  ...USERS_COLUMNS,
  { name: "notes", type: "text" },
  { name: "metadata", type: "jsonb" }
];

function PinnedColumnsGrid() {
  const columns = useMemo(
    () => buildTableColumns(PINNED_DEMO_COLUMNS, USERS_PRIMARY_KEYS, USERS_FOREIGN_KEYS),
    []
  );
  const rows = useMemo(
    () =>
      ALL_USERS.slice(0, 40).map((row) => ({
        ...row,
        notes: "Imported from the legacy IAM store",
        metadata: '{"source":"seed"}'
      })),
    []
  );
  const getRowId = useCallback((row: RowData) => String(row.id), []);
  const gridProps = useDataGrid<RowData>({
    data: rows,
    columns,
    getRowId,
    readOnly: true,
    rowHeight: "short",
    enableSearch: true,
    initialState: {
      columnPinning: {
        left: ["id"],
        right: ["created_at"]
      }
    }
  });

  return (
    <div className="ms-0 w-full max-w-[40rem] min-w-0">
      <ExplorerShell>
        <ExplorerGrid>
          <DataGrid {...gridProps} className="min-h-0 flex-1" stretchColumns />
        </ExplorerGrid>
      </ExplorerShell>
    </div>
  );
}

export const PinnedColumns: Story = {
  name: "Example: Pinned Columns",
  parameters: {
    docs: {
      description: {
        story:
          "There is no pin control in the header or context menu. Pass TanStack `initialState.columnPinning` (here `id` on the left, `created_at` on the right). The panel is start-anchored and narrower than the column sum so you can scroll horizontally: pinned columns stay sticky, the rest move toward the end. PAM enables pinning on data columns but does not set this state."
      }
    }
  },
  render: () => <PinnedColumnsGrid />
};
