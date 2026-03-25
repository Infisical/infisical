import { useCallback, useEffect, useState } from "react";
import { DatabaseIcon, SearchIcon, TableIcon, ViewIcon } from "lucide-react";

import { Select, SelectItem } from "@app/components/v2";
import { UnstableInput } from "@app/components/v3/generic/Input";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import { cn } from "@app/components/v3/utils";

import type { SchemaInfo, TableInfo } from "../data-explorer-types";

type DataExplorerSidebarProps = {
  schemas: SchemaInfo[];
  selectedSchema: string;
  onSchemaChange: (schema: string) => void;
  tables: TableInfo[];
  selectedTable: string | null;
  onTableSelect: (table: string) => void;
  isLoadingSchemas: boolean;
  isLoadingTables: boolean;
};

export const DataExplorerSidebar = ({
  schemas,
  selectedSchema,
  onSchemaChange,
  tables,
  selectedTable,
  onTableSelect,
  isLoadingSchemas,
  isLoadingTables
}: DataExplorerSidebarProps) => {
  const [search, setSearch] = useState("");

  // Reset search when schema changes
  useEffect(() => {
    setSearch("");
  }, [selectedSchema]);

  const filteredTables = tables.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  const getTableIcon = useCallback((tableType: string) => {
    if (tableType === "view" || tableType === "materialized_view") {
      return <ViewIcon className="size-3.5 shrink-0 text-accent" />;
    }
    return <TableIcon className="size-3.5 shrink-0 text-accent" />;
  }, []);

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-container">
      {/* Schema selector + Search */}
      <div className="space-y-2 border-b border-border p-3">
        {isLoadingSchemas ? (
          <Skeleton className="h-8 w-full" />
        ) : (
          <Select
            value={selectedSchema}
            onValueChange={onSchemaChange}
            className="w-full text-xs"
            LucideIcon={DatabaseIcon}
            iconClassName="text-accent"
          >
            {schemas.map((s) => (
              <SelectItem key={s.name} value={s.name}>
                {s.name}
              </SelectItem>
            ))}
          </Select>
        )}
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-accent" />
          <UnstableInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tables..."
            className="h-8 pl-7 text-xs text-foreground"
          />
        </div>
      </div>

      {/* Table list */}
      <div className="thin-scrollbar flex-1 overflow-y-auto">
        {isLoadingTables && tables.length === 0 && (
          <div className="space-y-1 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        )}
        {!isLoadingTables && filteredTables.length === 0 && (
          <div className="p-4 text-center text-xs text-accent">
            {search ? "No matching tables" : "No tables in this schema"}
          </div>
        )}
        {!isLoadingTables && filteredTables.length > 0 && (
          <div className="p-1">
            {filteredTables.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => onTableSelect(t.name)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-muted transition-colors hover:bg-container-hover",
                  selectedTable === t.name && "bg-container-hover text-foreground"
                )}
              >
                {getTableIcon(t.tableType)}
                <span className="truncate" title={t.name}>
                  {t.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table count */}
      <div className="border-t border-border px-3 py-2 text-xs text-accent">
        {tables.length} table{tables.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
};
