import { useCallback, useEffect, useState } from "react";
import { DatabaseIcon, SearchIcon, TableIcon, ViewIcon } from "lucide-react";

import { UnstableInput } from "@app/components/v3/generic/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3/generic/Select";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import { cn } from "@app/components/v3/utils";

import type { SchemaInfo, TableInfo } from "../data-browser-types";

type DataBrowserSidebarProps = {
  schemas: SchemaInfo[];
  selectedSchema: string;
  onSchemaChange: (schema: string) => void;
  tables: TableInfo[];
  selectedTable: string | null;
  onTableSelect: (table: string) => void;
  isLoadingSchemas: boolean;
  isLoadingTables: boolean;
};

export const DataBrowserSidebar = ({
  schemas,
  selectedSchema,
  onSchemaChange,
  tables,
  selectedTable,
  onTableSelect,
  isLoadingSchemas,
  isLoadingTables
}: DataBrowserSidebarProps) => {
  const [search, setSearch] = useState("");

  // Reset search when schema changes
  useEffect(() => {
    setSearch("");
  }, [selectedSchema]);

  const filteredTables = tables.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  const getTableIcon = useCallback((tableType: string) => {
    if (tableType === "view" || tableType === "materialized_view") {
      return <ViewIcon className="size-3.5 shrink-0 text-mineshaft-400" />;
    }
    return <TableIcon className="size-3.5 shrink-0 text-mineshaft-400" />;
  }, []);

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-mineshaft-600 bg-mineshaft-900">
      {/* Schema selector + Search */}
      <div className="space-y-2 border-b border-mineshaft-600 p-3">
        {isLoadingSchemas ? (
          <Skeleton className="h-8 w-full" />
        ) : (
          <Select value={selectedSchema} onValueChange={onSchemaChange}>
            <SelectTrigger className="h-8 w-full justify-start text-xs text-mineshaft-200">
              <DatabaseIcon className="size-3 text-mineshaft-400" />
              <SelectValue placeholder="Select schema" />
            </SelectTrigger>
            <SelectContent>
              {schemas.map((s) => (
                <SelectItem key={s.name} value={s.name}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-mineshaft-400" />
          <UnstableInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tables..."
            className="h-8 pl-7 text-xs text-mineshaft-200"
          />
        </div>
      </div>

      {/* Table list */}
      <div className="flex-1 overflow-y-auto">
        {isLoadingTables && (
          <div className="space-y-1 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        )}
        {!isLoadingTables && filteredTables.length === 0 && (
          <div className="p-4 text-center text-xs text-mineshaft-400">
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
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-mineshaft-300 transition-colors hover:bg-mineshaft-700",
                  selectedTable === t.name && "bg-mineshaft-700 text-mineshaft-100"
                )}
              >
                {getTableIcon(t.tableType)}
                <span className="truncate">{t.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table count */}
      <div className="border-t border-mineshaft-600 px-3 py-2 text-xs text-mineshaft-400">
        {tables.length} table{tables.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
};
