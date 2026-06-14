import { useEffect, useState } from "react";
import { CheckIcon, FilterIcon, PlusIcon, XIcon } from "lucide-react";

import { Button } from "@app/components/v3/generic/Button";
import { Input } from "@app/components/v3/generic/Input";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v3/generic/Popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3/generic/Select";

import type { ColumnInfo } from "../data-explorer-types";
import type { FilterCondition, FilterOperator } from "../sql-generation";

function getFilterPlaceholder(columnType: string, operator: FilterOperator): string {
  switch (operator) {
    case "LIKE":
      return "%pattern%";
    case "ILIKE":
      return "%pattern% (case-insensitive)";
    case "IN":
      return "a, b, c";
    case "IS NULL":
    case "IS NOT NULL":
      return "";
    default:
      break;
  }

  const t = columnType.toLowerCase().replace("[]", "");
  switch (t) {
    case "int2":
    case "int4":
    case "int8":
    case "serial":
    case "bigserial":
    case "smallserial":
    case "integer":
    case "bigint":
    case "smallint":
      return "42";
    case "float4":
    case "float8":
    case "numeric":
    case "decimal":
    case "real":
    case "double precision":
    case "money":
      return "3.14";
    case "bool":
    case "boolean":
      return "true";
    case "uuid":
      return "550e8400-e29b-41d4-a716-...";
    case "date":
      return "2024-01-15";
    case "timestamp":
    case "timestamptz":
      return "2024-01-15 09:30:00";
    case "time":
    case "timetz":
      return "09:30:00";
    case "json":
    case "jsonb":
      return '{"key": "value"}';
    case "inet":
    case "cidr":
      return "192.168.1.0/24";
    case "text":
    case "varchar":
    case "char":
    case "bpchar":
    case "name":
    case "citext":
      return "some text";
    default:
      return "Value";
  }
}

const OPERATORS: { value: FilterOperator; label: string; needsValue: boolean }[] = [
  { value: "=", label: "equals", needsValue: true },
  { value: "<>", label: "not equals", needsValue: true },
  { value: ">", label: "greater than", needsValue: true },
  { value: "<", label: "less than", needsValue: true },
  { value: ">=", label: "greater or equal", needsValue: true },
  { value: "<=", label: "less or equal", needsValue: true },
  { value: "LIKE", label: "like", needsValue: true },
  { value: "ILIKE", label: "ilike", needsValue: true },
  { value: "IS NULL", label: "is null", needsValue: false },
  { value: "IS NOT NULL", label: "is not null", needsValue: false },
  { value: "IN", label: "in", needsValue: true }
];

type FilterPopoverProps = {
  columns: ColumnInfo[];
  filters: FilterCondition[];
  onFiltersChange: (filters: FilterCondition[]) => Promise<boolean>;
};

export const FilterPopover = ({ columns, filters, onFiltersChange }: FilterPopoverProps) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterCondition[]>(filters);
  const [isApplying, setIsApplying] = useState(false);

  // Sync draft when external filters change (e.g. cleared from outside)
  useEffect(() => {
    if (!open) {
      setDraft(filters);
    }
  }, [filters, open]);

  // Reset draft when popover opens; prevent close while applying
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && isApplying) return;
    if (isOpen) {
      setDraft(filters);
    }
    setOpen(isOpen);
  };

  const addFilter = () => {
    if (columns.length === 0) return;
    setDraft((prev) => [...prev, { column: columns[0].name, operator: "=", value: "" }]);
  };

  const removeFilter = (index: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== index));
  };

  const updateFilter = (index: number, update: Partial<FilterCondition>) => {
    setDraft((prev) => prev.map((f, i) => (i === index ? { ...f, ...update } : f)));
  };

  const clearAll = async () => {
    setIsApplying(true);
    await onFiltersChange([]);
    setIsApplying(false);
    setOpen(false);
  };

  const applyFilters = async () => {
    setIsApplying(true);
    const success = await onFiltersChange(draft);
    setIsApplying(false);
    if (success) setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs" className="gap-1.5">
          <FilterIcon className="size-3" />
          Filter
          {filters.length > 0 && (
            <span className="rounded-full bg-primary/20 px-1.5 text-[10px] font-medium text-primary">
              {filters.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[580px] p-3" align="start">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-mineshaft-200">Filters</span>
          {draft.length > 0 && (
            <Button variant="ghost" size="xs" onClick={clearAll} className="h-auto p-0 text-xs">
              Clear all
            </Button>
          )}
        </div>

        {draft.length === 0 ? (
          <p className="py-3 text-center text-xs text-mineshaft-400">No filters applied</p>
        ) : (
          <div className="space-y-2">
            {draft.map((filter, index) => {
              const opConfig = OPERATORS.find((o) => o.value === filter.operator);
              const colInfo = columns.find((c) => c.name === filter.column);
              return (
                // eslint-disable-next-line react/no-array-index-key
                <div key={index} className="flex items-center gap-1.5">
                  <Select
                    value={filter.column}
                    onValueChange={(val) => updateFilter(index, { column: val })}
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-40 text-xs text-mineshaft-200"
                      title={filter.column}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map((col) => (
                        <SelectItem key={col.name} value={col.name}>
                          {col.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={filter.operator}
                    onValueChange={(val) =>
                      updateFilter(index, { operator: val as FilterOperator })
                    }
                  >
                    <SelectTrigger size="sm" className="w-28 text-xs text-mineshaft-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATORS.map((op) => (
                        <SelectItem key={op.value} value={op.value}>
                          {op.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {opConfig?.needsValue !== false && (
                    <Input
                      value={filter.value}
                      onChange={(e) => updateFilter(index, { value: e.target.value })}
                      placeholder={getFilterPlaceholder(colInfo?.type ?? "", filter.operator)}
                      className="h-7 flex-1 text-xs text-mineshaft-200"
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => removeFilter(index)}
                    className="rounded p-1 text-mineshaft-400 hover:bg-mineshaft-700 hover:text-mineshaft-200"
                  >
                    <XIcon className="size-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <Button variant="outline" size="xs" onClick={addFilter} className="gap-1">
            <PlusIcon className="size-3" />
            Add filter
          </Button>
          <Button
            variant="info"
            size="xs"
            onClick={applyFilters}
            isPending={isApplying}
            className="gap-1"
          >
            <CheckIcon className="size-3" />
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
