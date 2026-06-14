import { useCallback, useEffect, useRef, useState } from "react";
import { DatabaseIcon, SearchIcon, TableIcon, ViewIcon } from "lucide-react";

import { Input } from "@app/components/v3/generic/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3/generic/Select/Select";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import { cn } from "@app/components/v3/utils";

import type { SchemaInfo, TableInfo } from "../data-explorer-types";

type SelectedTab = { schema: string; table: string };

type DataExplorerSidebarProps = {
  schemas: SchemaInfo[];
  selectedSchema: string;
  onSchemaChange: (schema: string) => void;
  tables: TableInfo[];
  activeBrowseTarget: SelectedTab | null;
  onTableOpen: (table: string, opts: { forceNew: boolean }) => void;
  isLoadingSchemas: boolean;
  isLoadingTables: boolean;
  disabled?: boolean;
};

type ContextMenuState = {
  tableName: string;
  x: number;
  y: number;
};

export const DataExplorerSidebar = ({
  schemas,
  selectedSchema,
  onSchemaChange,
  tables,
  activeBrowseTarget,
  onTableOpen,
  isLoadingSchemas,
  isLoadingTables,
  disabled = false
}: DataExplorerSidebarProps) => {
  const [search, setSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Reset search when schema changes
  useEffect(() => {
    setSearch("");
  }, [selectedSchema]);

  // Close context menu on outside click / Escape
  useEffect(() => {
    if (!contextMenu) return undefined;
    const handleDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("mousedown", handleDown);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleDown);
      window.removeEventListener("keydown", handleKey);
    };
  }, [contextMenu]);

  const filteredTables = tables.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  const getTableIcon = useCallback((tableType: string) => {
    if (tableType === "view" || tableType === "materialized_view") {
      return <ViewIcon className="size-3.5 shrink-0 text-accent" />;
    }
    return <TableIcon className="size-3.5 shrink-0 text-accent" />;
  }, []);

  const handleClick = (name: string, e: React.MouseEvent) => {
    if (disabled) return;
    const forceNew = e.metaKey || e.ctrlKey;
    onTableOpen(name, { forceNew });
  };

  const handleContextMenu = (name: string, e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    setContextMenu({ tableName: name, x: e.clientX, y: e.clientY });
  };

  const handleOpenInNewTab = () => {
    if (!contextMenu) return;
    onTableOpen(contextMenu.tableName, { forceNew: true });
    setContextMenu(null);
  };

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-container">
      {/* Schema selector + Search */}
      <div className="space-y-2 border-b border-border p-3">
        {isLoadingSchemas ? (
          <Skeleton className="h-8 w-full" />
        ) : (
          <Select value={selectedSchema} onValueChange={onSchemaChange} disabled={disabled}>
            <SelectTrigger className="h-9 w-full text-xs text-foreground">
              <span className="flex items-center gap-1.5">
                <DatabaseIcon className="size-3.5 text-accent" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent position="popper">
              {schemas.map((s) => (
                <SelectItem key={s.name} value={s.name}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-accent" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tables..."
            className="pl-7 text-xs text-foreground"
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
            {filteredTables.map((t) => {
              const isActive =
                activeBrowseTarget?.schema === selectedSchema &&
                activeBrowseTarget.table === t.name;
              return (
                <button
                  key={t.name}
                  type="button"
                  disabled={disabled}
                  onClick={(e) => handleClick(t.name, e)}
                  onContextMenu={(e) => handleContextMenu(t.name, e)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-muted transition-colors hover:bg-container-hover disabled:cursor-not-allowed disabled:opacity-50",
                    isActive && "bg-container-hover text-foreground"
                  )}
                >
                  {getTableIcon(t.tableType)}
                  <span className="truncate" title={t.name}>
                    {t.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, zIndex: 50 }}
          className="min-w-[160px] rounded-md border border-border bg-popover p-1 text-xs text-foreground shadow-md"
        >
          <button
            type="button"
            onClick={handleOpenInNewTab}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-container-hover"
          >
            Open in new tab
          </button>
        </div>
      )}
    </div>
  );
};
