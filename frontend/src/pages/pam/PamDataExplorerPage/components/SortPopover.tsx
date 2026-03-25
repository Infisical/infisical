import { useMemo, useState } from "react";
import { ArrowUpDownIcon, SearchIcon } from "lucide-react";

import { Button } from "@app/components/v3/generic/Button";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v3/generic/Popover";

import type { ColumnInfo } from "../data-explorer-types";
import type { SortCondition } from "../sql-generation";

type SortPopoverProps = {
  columns: ColumnInfo[];
  sorts: SortCondition[];
  onSortsChange: (sorts: SortCondition[]) => void;
};

export const SortPopover = ({ columns, sorts, onSortsChange }: SortPopoverProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const activeSort = sorts[0] ?? null;
  const isAscending = activeSort?.direction !== "DESC";

  const filteredColumns = useMemo(
    () => columns.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    [columns, search]
  );

  const handleColumnSelect = (colName: string) => {
    if (activeSort?.column === colName) {
      onSortsChange([]);
    } else {
      onSortsChange([{ column: colName, direction: isAscending ? "ASC" : "DESC" }]);
    }
  };

  const handleDirectionToggle = () => {
    if (!activeSort) return;
    onSortsChange([
      { column: activeSort.column, direction: activeSort.direction === "ASC" ? "DESC" : "ASC" }
    ]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs" className="gap-1.5">
          <ArrowUpDownIcon className="size-3" />
          Sort
          {activeSort && (
            <span className="rounded-full bg-primary/20 px-1.5 text-[10px] font-medium text-primary">
              {activeSort.column}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-mineshaft-600 px-3 py-2">
          <span className="text-sm font-medium text-mineshaft-200">Sort by</span>
          <button
            type="button"
            onClick={handleDirectionToggle}
            disabled={!activeSort}
            className="flex items-center gap-1.5 rounded px-2 py-0.5 text-xs text-mineshaft-300 transition-colors hover:bg-mineshaft-700 disabled:opacity-40"
          >
            {isAscending ? "Ascending" : "Descending"}
            <ArrowUpDownIcon className="size-3" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-mineshaft-600 px-3 py-2">
          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-mineshaft-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="h-7 w-full rounded border border-mineshaft-600 bg-transparent pr-2 pl-7 text-xs text-mineshaft-200 outline-none placeholder:text-mineshaft-500 focus:border-mineshaft-400"
            />
          </div>
        </div>

        {/* Column list */}
        <div className="max-h-[280px] overflow-y-auto p-1">
          {filteredColumns.map((col) => (
            <button
              key={col.name}
              type="button"
              onClick={() => handleColumnSelect(col.name)}
              className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs transition-colors ${
                activeSort?.column === col.name
                  ? "bg-mineshaft-700 text-mineshaft-100"
                  : "text-mineshaft-300 hover:bg-mineshaft-700/50"
              }`}
            >
              <span
                className={`size-3.5 shrink-0 rounded-full border ${
                  activeSort?.column === col.name
                    ? "border-primary bg-primary"
                    : "border-mineshaft-500"
                }`}
              />
              <span className="truncate" title={col.name}>{col.name}</span>
            </button>
          ))}
          {filteredColumns.length === 0 && (
            <p className="py-3 text-center text-xs text-mineshaft-400">No matching columns</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
