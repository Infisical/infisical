import { ArrowUpDownIcon, CheckIcon } from "lucide-react";

import { Button } from "@app/components/v3/generic/Button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@app/components/v3/generic/Command";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v3/generic/Popover";
import { cn } from "@app/components/v3/utils";

import type { ColumnInfo } from "../data-explorer-types";
import type { SortCondition } from "../sql-generation";

type SortPopoverProps = {
  columns: ColumnInfo[];
  sorts: SortCondition[];
  onSortsChange: (sorts: SortCondition[]) => void;
  disabled?: boolean;
};

export const SortPopover = ({
  columns,
  sorts,
  onSortsChange,
  disabled = false
}: SortPopoverProps) => {
  const activeSort = sorts[0] ?? null;
  const isAscending = activeSort?.direction !== "DESC";

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
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs" className="gap-1.5" disabled={disabled}>
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
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium text-foreground">Sort by</span>
          <button
            type="button"
            onClick={handleDirectionToggle}
            disabled={!activeSort || disabled}
            className="flex items-center gap-1.5 rounded px-2 py-0.5 text-xs text-muted transition-colors hover:bg-foreground/5 disabled:opacity-40"
          >
            {isAscending ? "Ascending" : "Descending"}
            <ArrowUpDownIcon className="size-3" />
          </button>
        </div>
        <Command>
          <CommandInput placeholder="Search columns..." />
          <CommandList>
            <CommandEmpty>No matching columns</CommandEmpty>
            <CommandGroup>
              {columns.map((col) => (
                <CommandItem
                  key={col.name}
                  value={col.name}
                  onSelect={() => handleColumnSelect(col.name)}
                  disabled={disabled}
                >
                  <CheckIcon
                    className={cn(
                      "size-3.5",
                      activeSort?.column === col.name ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{col.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
