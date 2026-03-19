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

import type { ColumnInfo } from "../data-browser-types";
import type { FilterCondition, SortCondition } from "../sql-generation";
import { FilterPopover } from "./FilterPopover";
import { SortPopover } from "./SortPopover";

type DataBrowserToolbarProps = {
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
  selectedRowCount: number;
  onDeleteSelected: () => void;
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  executionTimeMs: number | null;
  hasPrimaryKey: boolean;
  onRefresh: () => void;
  isRefreshing?: boolean;
};

export const DataBrowserToolbar = ({
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
  selectedRowCount,
  onDeleteSelected,
  totalCount,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  executionTimeMs,
  hasPrimaryKey,
  onRefresh,
  isRefreshing = false
}: DataBrowserToolbarProps) => {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex items-center justify-between border-b border-mineshaft-600 px-3 py-1.5">
      <div className="flex items-center gap-2">
        <FilterPopover columns={columns} filters={filters} onFiltersChange={onFiltersChange} />
        <SortPopover columns={columns} sorts={sorts} onSortsChange={onSortsChange} />

        {hasPrimaryKey && (
          <>
            <div className="h-4 w-px bg-mineshaft-600" />
            <Button variant="outline" size="xs" onClick={onAddRecord} className="gap-1">
              <PlusIcon className="size-3" />
              Add record
            </Button>
          </>
        )}

        {selectedRowCount > 0 && hasPrimaryKey && (
          <Button
            variant="outline"
            size="xs"
            onClick={onDeleteSelected}
            className="gap-1 text-red-400 hover:text-red-300"
          >
            <Trash2Icon className="size-3" />
            Delete {selectedRowCount} record{selectedRowCount !== 1 ? "s" : ""}
          </Button>
        )}

        {changeCount > 0 && (
          <>
            <div className="h-4 w-px bg-mineshaft-600" />
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
              Discard
            </Button>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {executionTimeMs !== null && (
          <span className="flex items-center gap-1 text-xs text-mineshaft-400">
            <ClockIcon className="size-3" />
            {executionTimeMs}ms
          </span>
        )}

        {/* Pagination */}
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded p-1 text-mineshaft-400 transition-colors hover:bg-mineshaft-700 hover:text-mineshaft-200 disabled:opacity-30"
        >
          <ChevronLeftIcon className="size-3.5" />
        </button>
        <LimitOffsetPopover
          totalCount={totalCount}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          pageSize={pageSize}
          page={page}
          onPageSizeChange={onPageSizeChange}
          onPageChange={onPageChange}
        />
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded p-1 text-mineshaft-400 transition-colors hover:bg-mineshaft-700 hover:text-mineshaft-200 disabled:opacity-30"
        >
          <ChevronRightIcon className="size-3.5" />
        </button>

        {/* Refresh */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="rounded p-1 text-mineshaft-400 transition-colors hover:bg-mineshaft-700 hover:text-mineshaft-200 disabled:opacity-50"
        >
          <RefreshCwIcon className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
        </button>
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
  page: number;
  onPageSizeChange: (size: number) => void;
  onPageChange: (page: number) => void;
};

const LimitOffsetPopover = ({
  totalCount,
  rangeStart,
  rangeEnd,
  pageSize,
  page,
  onPageSizeChange,
  onPageChange
}: LimitOffsetPopoverProps) => {
  const [open, setOpen] = useState(false);
  const [limitInput, setLimitInput] = useState(String(pageSize));
  const [offsetInput, setOffsetInput] = useState(String((page - 1) * pageSize));

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setLimitInput(String(pageSize));
      setOffsetInput(String((page - 1) * pageSize));
    }
    setOpen(isOpen);
  };

  const applyChanges = () => {
    const newLimit = Math.max(1, Math.min(1000, Number(limitInput) || 50));
    const newOffset = Math.max(0, Number(offsetInput) || 0);
    const newPage = Math.floor(newOffset / newLimit) + 1;
    onPageSizeChange(newLimit);
    onPageChange(newPage);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded px-2 py-0.5 text-xs text-mineshaft-300 transition-colors hover:bg-mineshaft-700"
        >
          {rangeStart} - {rangeEnd} of {totalCount}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="center">
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-medium text-mineshaft-400">Limit</span>
            <input
              type="number"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyChanges()}
              className="h-8 w-16 rounded border border-mineshaft-600 bg-transparent text-center text-sm text-mineshaft-200 outline-none focus:border-mineshaft-400"
              min={1}
              max={1000}
            />
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-medium text-mineshaft-400">Offset</span>
            <input
              type="number"
              value={offsetInput}
              onChange={(e) => setOffsetInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyChanges()}
              className="h-8 w-16 rounded border border-mineshaft-600 bg-transparent text-center text-sm text-mineshaft-200 outline-none focus:border-mineshaft-400"
              min={0}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
