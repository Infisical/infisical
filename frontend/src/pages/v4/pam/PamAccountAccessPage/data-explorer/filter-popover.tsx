import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Input } from "@infisical/cipher/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from "@infisical/cipher/ui/popover";
import { Select } from "@infisical/cipher/ui/select";
import { FilterIcon } from "lucide-react";

import type { ColumnInfo } from "./protocol";
import type { FilterCondition, FilterOperator, SqlDialect } from "./sql";

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

const TYPE_PLACEHOLDERS: [RegExp, string][] = [
  [/^(int[248]?|integer|bigint|smallint|tinyint|mediumint|(small|big)?serial)$/, "42"],
  [/^(float[48]?|numeric|decimal|real|double( precision)?|money)$/, "3.14"],
  [/^bool(ean)?$/, "true"],
  [/^uuid$/, "550e8400-e29b-41d4-a716-..."],
  [/^date$/, "2024-01-15"],
  [/^(timestamptz|timestamp|datetime)$/, "2024-01-15 09:30:00"],
  [/^timetz?$/, "09:30:00"],
  [/^jsonb?$/, '{"key": "value"}'],
  [/^(inet|cidr)$/, "192.168.1.0/24"],
  [/^(text|varchar|char|bpchar|name|citext|tinytext|mediumtext|longtext|enum)$/, "some text"]
];

const placeholderFor = (columnType: string, operator: FilterOperator) => {
  if (operator === "LIKE") return "%pattern%";
  if (operator === "ILIKE") return "%pattern% (case-insensitive)";
  if (operator === "IN") return "a, b, c";
  const type = columnType
    .toLowerCase()
    .replace("[]", "")
    .replace(/\(\d+\)/g, "");
  return TYPE_PLACEHOLDERS.find(([pattern]) => pattern.test(type))?.[1] ?? "Value";
};

type DraftFilter = FilterCondition & { id: string };

const toDraft = (filters: FilterCondition[]): DraftFilter[] =>
  filters.map((filter) => ({ ...filter, id: crypto.randomUUID() }));

export const FilterPopover = ({
  columns,
  filters,
  onFiltersChange,
  dialect
}: {
  columns: ColumnInfo[];
  filters: FilterCondition[];
  onFiltersChange: (filters: FilterCondition[]) => Promise<boolean>;
  dialect: SqlDialect;
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftFilter[]>(() => toDraft(filters));
  const [isApplying, setIsApplying] = useState(false);
  const operators = OPERATORS.filter(({ value }) => dialect !== "mysql" || value !== "ILIKE");

  const update = (index: number, patch: Partial<FilterCondition>) =>
    setDraft((previous) =>
      previous.map((filter, position) => (position === index ? { ...filter, ...patch } : filter))
    );

  const apply = async (next: DraftFilter[]) => {
    setIsApplying(true);
    const ok = await onFiltersChange(next.map(({ id, ...filter }) => filter));
    setIsApplying(false);
    if (ok) setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next && isApplying) return;
        if (next) setDraft(toDraft(filters));
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" icon={FilterIcon}>
          {filters.length > 0
            ? `${filters.length} ${filters.length === 1 ? "filter" : "filters"}`
            : "Filter"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" style={{ width: 600 }}>
        <PopoverHeader>
          <PopoverTitle>Filters</PopoverTitle>
        </PopoverHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--cipher-space-8)" }}>
          {draft.length === 0 ? (
            <span style={{ color: "var(--cipher-muted)" }}>No filters applied</span>
          ) : (
            draft.map((filter, index) => {
              const needsValue = OPERATORS.find(
                ({ value }) => value === filter.operator
              )?.needsValue;
              const type = columns.find(({ name }) => name === filter.column)?.type ?? "";
              return (
                <div
                  key={filter.id}
                  style={{ display: "flex", alignItems: "center", gap: "var(--cipher-space-6)" }}
                >
                  <div style={{ width: 170, flexShrink: 0 }}>
                    <Select
                      aria-label="Column"
                      size="sm"
                      value={filter.column}
                      onChange={(column) => update(index, { column })}
                      options={columns.map(({ name }) => ({ value: name, label: name }))}
                    />
                  </div>
                  <div style={{ width: 150, flexShrink: 0 }}>
                    <Select
                      aria-label="Operator"
                      size="sm"
                      value={filter.operator}
                      onChange={(operator) =>
                        update(index, { operator: operator as FilterOperator })
                      }
                      options={operators}
                    />
                  </div>
                  {needsValue && (
                    <Input
                      aria-label="Value"
                      mono
                      value={filter.value}
                      placeholder={placeholderFor(type, filter.operator)}
                      onChange={(event) => update(index, { value: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.nativeEvent.isComposing) apply(draft);
                      }}
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    iconOnly
                    icon="x"
                    aria-label={`Remove filter on ${filter.column}`}
                    onClick={() =>
                      setDraft((previous) => previous.filter((_, position) => position !== index))
                    }
                  />
                </div>
              );
            })
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "var(--cipher-space-8)"
            }}
          >
            <Button
              variant="outline"
              size="sm"
              icon="plus"
              disabledReason={columns.length === 0 ? "This table has no columns" : undefined}
              onClick={() =>
                setDraft((previous) => [
                  ...previous,
                  {
                    id: crypto.randomUUID(),
                    column: columns[0]?.name ?? "",
                    operator: "=",
                    value: ""
                  }
                ])
              }
            >
              Add filter
            </Button>
            <div style={{ display: "flex", gap: "var(--cipher-space-8)" }}>
              {filters.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => apply([])}>
                  Clear all
                </Button>
              )}
              <Button size="sm" loading={isApplying} onClick={() => apply(draft)}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
