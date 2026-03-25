import { useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  Trash2Icon,
  UndoIcon
} from "lucide-react";

import { Button } from "@app/components/v3/generic/Button";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v3/generic/Popover";

import type { ColumnInfo } from "../data-explorer-types";
import type { FilterCondition, SortCondition } from "../sql-generation";
import { FilterPopover } from "./FilterPopover";
import { SortPopover } from "./SortPopover";

type DataExplorerToolbarProps = {
  columns: ColumnInfo[];
  filters: FilterCondition[];
  onFiltersChange: (filters: FilterCondition[]) => void;
  sorts: SortCondition[];
  onSortsChange: (sorts: SortCondition[]) => void;
  changeCount: number;
  onSave: () => void;
  onDiscard: () => void;
  isSaving: boolean;
  onAddRecord: () => void;
  hasNewRow: boolean;
  selectedRowCount: number;
  onDeleteSelected: () => void;
  totalCount: number;
  offset: number;
  pageSize: number;
  onOffsetChange: (offset: number) => void;
  onPageSizeChange: (size: number) => void;
  executionTimeMs: number | null;
  hasPrimaryKey: boolean;
  onRefresh: () => void;
  isRefreshing?: boolean;
};

export const DataExplorerToolbar = ({
  columns,
  filters,
  onFiltersChange,
  sorts,
  onSortsChange,
  changeCount,
  onSave,
  onDiscard,
  isSaving,
  onAddRecord,
  hasNewRow,
  selectedRowCount,
  onDeleteSelected,
  totalCount,
  offset,
  pageSize,
  onOffsetChange,
  onPageSizeChange,
  executionTimeMs,
  hasPrimaryKey,
  onRefresh,
  isRefreshing = false
}: DataExplorerToolbarProps) => {
  const rangeStart = totalCount === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + pageSize, totalCount);

  return (
    <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
      <div className="flex items-center gap-2">
        <FilterPopover columns={columns} filters={filters} onFiltersChange={onFiltersChange} />
        <SortPopover columns={columns} sorts={sorts} onSortsChange={onSortsChange} />

        {hasPrimaryKey && (
          <>
            <div className="h-4 w-px bg-border" />
            <Button
              variant="outline"
              size="xs"
              onClick={onAddRecord}
              disabled={hasNewRow}
              className="gap-1"
            >
              <PlusIcon className="size-3" />
              Add record
            </Button>
          </>
        )}

        {selectedRowCount > 0 && hasPrimaryKey && (
          <Button variant="danger" size="xs" onClick={onDeleteSelected} className="gap-1">
            <Trash2Icon className="size-3" />
            Delete {selectedRowCount} record{selectedRowCount !== 1 ? "s" : ""}
          </Button>
        )}

        {changeCount > 0 && (
          <>
            <div className="h-4 w-px bg-border" />
            <Button
              variant="info"
              size="xs"
              onClick={onSave}
              isPending={isSaving}
              className="gap-1"
            >
              <SaveIcon className="size-3" />
              Save {changeCount} change{changeCount !== 1 ? "s" : ""}
            </Button>
            <Button variant="outline" size="xs" onClick={onDiscard} className="gap-1">
              <UndoIcon className="size-3" />
              Discard changes
            </Button>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {executionTimeMs !== null && (
          <span className="flex items-center gap-1 text-xs text-accent">
            <ClockIcon className="size-3" />
            {executionTimeMs}ms
          </span>
        )}

        {/* Pagination */}
        <Button
          variant="ghost"
          size="xs"
          disabled={offset <= 0}
          onClick={() => onOffsetChange(Math.max(0, offset - pageSize))}
          className="size-7 p-0"
        >
          <ChevronLeftIcon className="size-3.5" />
        </Button>
        {/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
        <LimitOffsetPopover
          totalCount={totalCount}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          pageSize={pageSize}
          offset={offset}
          onPageSizeChange={onPageSizeChange}
          onOffsetChange={onOffsetChange}
        />
        <Button
          variant="ghost"
          size="xs"
          disabled={offset + pageSize >= totalCount}
          onClick={() => onOffsetChange(offset + pageSize)}
          className="size-7 p-0"
        >
          <ChevronRightIcon className="size-3.5" />
        </Button>

        {/* Refresh */}
        <Button
          variant="ghost"
          size="xs"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="size-7 p-0"
        >
          <RefreshCwIcon className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </div>
  );
};

// --- Limit / Offset popover ---

type LimitOffsetPopoverProps = {
  totalCount: number;
  rangeStart: number;
  rangeEnd: number;
  pageSize: number;
  offset: number;
  onPageSizeChange: (size: number) => void;
  onOffsetChange: (offset: number) => void;
};

const LimitOffsetPopover = ({
  totalCount,
  rangeStart,
  rangeEnd,
  pageSize,
  offset,
  onPageSizeChange,
  onOffsetChange
}: LimitOffsetPopoverProps) => {
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
  const getLimitError = (): string | null => {
    if (limitInput === "" || Number.isNaN(limitNum)) return "Must be a number";
    if (limitNum < 1) return "Minimum is 1";
    if (limitNum > 1000) return "Maximum is 1000";
    return null;
  };
  const limitError = getLimitError();

  const applyChanges = () => {
    if (limitError) return;
    const newLimit = Math.max(1, Math.min(1000, limitNum || 50));
    const newOffset = Math.max(0, Number(offsetInput) || 0);
    onPageSizeChange(newLimit);
    onOffsetChange(newOffset);
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
                className={`h-8 w-16 rounded border bg-transparent text-center text-sm text-mineshaft-200 outline-none ${
                  limitError
                    ? "border-red-500 focus:border-red-500"
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
                className="h-8 w-16 rounded border border-border bg-transparent text-center text-sm text-mineshaft-200 outline-none focus:border-ring"
              />
            </div>
          </div>
          {limitError && <p className="text-center text-[10px] text-red-400">{limitError}</p>}
          <Button
            variant="outline"
            size="xs"
            onClick={applyChanges}
            disabled={Boolean(limitError)}
            className="w-full"
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
