import * as React from "react";

import { Button } from "../ui/button";
import { ButtonGroup } from "../ui/button-group";
import { Calendar } from "../ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import { MultiSelect } from "../ui/multi-select";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

import styles from "./filter-bar.module.css";

export type FilterBarOption = { value: string; label: string; group?: string };
type FilterBarChoiceField = {
  key: string;
  label: string;
  options: readonly FilterBarOption[];
  searchable?: boolean;
};
export type FilterBarField =
  | (FilterBarChoiceField & { type: "select" })
  | (FilterBarChoiceField & { type: "multi-select" })
  | { key: string; label: string; type: "date"; defaultMonth?: Date }
  | { key: string; label: string; type: "text"; placeholder?: string };
export type FilterBarFilter = {
  field: string;
  operator?: "before" | "after";
  values: string[];
};
export type FilterBarProps = {
  label: string;
  fields: readonly FilterBarField[];
  value: readonly FilterBarFilter[];
  onChange: (value: FilterBarFilter[]) => void;
  search?: React.ReactNode;
  actions?: React.ReactNode;
};

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parseDate = (value: string | undefined) => {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const describeFilter = (field: FilterBarField, filter: FilterBarFilter) => {
  if (field.type === "date")
    return { verb: filter.operator ?? "before", value: filter.values[0] ?? "any date" };
  if (field.type === "text") return { verb: "contains", value: filter.values[0] ?? "anything" };
  const labels = filter.values.map(
    (value) => field.options.find((option) => option.value === value)?.label ?? value
  );
  let value = "any";
  if (labels.length === 1) [value] = labels;
  else if (labels.length === 2) value = `${labels[0]} or ${labels[1]}`;
  else if (labels.length > 2) value = `${labels[0]} or ${labels.length - 1} more`;
  return { verb: "is", value };
};

export const FilterBar = ({ label, fields, value, onChange, search, actions }: FilterBarProps) => {
  const [open, setOpen] = React.useState<string | null>(null);
  const [focusTarget, setFocusTarget] = React.useState<string | null>(null);
  const picked = React.useRef<string | null>(null);
  const addButton = React.useRef<HTMLButtonElement>(null);
  const triggers = React.useRef(new Map<string, HTMLButtonElement>());

  React.useEffect(() => {
    if (!focusTarget) return;
    (focusTarget === "add" ? addButton.current : triggers.current.get(focusTarget))?.focus();
    setFocusTarget(null);
  }, [focusTarget]);

  const latest = React.useRef(value);
  latest.current = value;
  const commit = (next: FilterBarFilter[]) => {
    latest.current = next;
    onChange(next);
  };
  const update = (key: string, patch: Partial<FilterBarFilter>) =>
    commit(
      latest.current.map((filter) => (filter.field === key ? { ...filter, ...patch } : filter))
    );
  const remove = (key: string) => {
    const index = latest.current.findIndex((filter) => filter.field === key);
    const next = latest.current.filter((filter) => filter.field !== key);
    commit(next);
    setFocusTarget((next[index] ?? next[index - 1])?.field ?? "add");
  };
  const add = (field: FilterBarField) => {
    picked.current = field.key;
    commit([
      ...latest.current,
      { field: field.key, operator: field.type === "date" ? "before" : undefined, values: [] }
    ]);
  };
  const changeOpen = (key: string, next: boolean) => {
    setOpen(next ? key : null);
    if (next) return;
    if (!latest.current.find((filter) => filter.field === key)?.values.length) remove(key);
  };

  return (
    <div className={styles.bar} data-slot="filter-bar" role="search" aria-label={label}>
      <div className={styles.top}>
        {search && <div className={styles.search}>{search}</div>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button ref={addButton} variant="outline" icon="plus">
              Add filter
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(event) => {
              if (!picked.current) return;
              event.preventDefault();
              setOpen(picked.current);
              picked.current = null;
            }}
          >
            <DropdownMenuLabel>Filter by</DropdownMenuLabel>
            {fields.map((field) => {
              const applied = value.some((filter) => filter.field === field.key);
              return (
                <DropdownMenuItem
                  key={field.key}
                  disabled={applied}
                  description={applied ? "Already applied" : undefined}
                  onSelect={() => add(field)}
                >
                  {field.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        {actions}
      </div>
      {value.length > 0 && (
        <div className={styles.applied}>
          <ul className={styles.chips} aria-label="Applied filters">
            {value.map((filter) => {
              const field = fields.find((entry) => entry.key === filter.field);
              if (!field) return null;
              const text = describeFilter(field, filter);
              const trigger = (
                <Button
                  ref={(node) => {
                    if (node) triggers.current.set(field.key, node);
                    else triggers.current.delete(field.key);
                  }}
                  variant="outline"
                  iconRight="chev-down"
                  aria-label={`${field.label} ${text.verb} ${text.value}`}
                >
                  <span className={styles.field}>{`${field.label} ${text.verb}`}</span>
                  <span className={styles.value}>{text.value}</span>
                </Button>
              );
              const isOpen = open === field.key;
              const openChange = (next: boolean) => changeOpen(field.key, next);
              let picker: React.ReactNode;
              if (field.type === "select")
                picker = (
                  <MultiSelect
                    multiple={false}
                    label={field.label}
                    options={field.options}
                    searchable={field.searchable}
                    value={filter.values[0] ?? null}
                    onChange={(next) => update(field.key, { values: next ? [next] : [] })}
                    open={isOpen}
                    onOpenChange={openChange}
                    trigger={trigger}
                  />
                );
              else if (field.type === "multi-select")
                picker = (
                  <MultiSelect
                    label={field.label}
                    options={field.options}
                    searchable={field.searchable}
                    value={filter.values}
                    onChange={(next) => update(field.key, { values: next })}
                    open={isOpen}
                    onOpenChange={openChange}
                    trigger={trigger}
                  />
                );
              else
                picker = (
                  <Popover open={isOpen} onOpenChange={openChange}>
                    <PopoverTrigger asChild>{trigger}</PopoverTrigger>
                    <PopoverContent align="start" aria-label={`${field.label} filter`}>
                      {field.type === "date" ? (
                        <div className={styles.date}>
                          <ToggleGroup
                            type="single"
                            size="sm"
                            aria-label={`${field.label} comparison`}
                            value={filter.operator ?? "before"}
                            onValueChange={(next) => {
                              if (next === "before" || next === "after")
                                update(field.key, { operator: next });
                            }}
                          >
                            <ToggleGroupItem value="before">Before</ToggleGroupItem>
                            <ToggleGroupItem value="after">After</ToggleGroupItem>
                          </ToggleGroup>
                          <Calendar
                            mode="single"
                            aria-label={field.label}
                            defaultMonth={parseDate(filter.values[0]) ?? field.defaultMonth}
                            selected={parseDate(filter.values[0])}
                            onSelect={(date) =>
                              update(field.key, { values: date ? [isoDate(date)] : [] })
                            }
                          />
                        </div>
                      ) : (
                        <Input
                          aria-label={field.label}
                          placeholder={field.placeholder}
                          value={filter.values[0] ?? ""}
                          onChange={(event) =>
                            update(field.key, {
                              values: event.target.value ? [event.target.value] : []
                            })
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") openChange(false);
                          }}
                        />
                      )}
                    </PopoverContent>
                  </Popover>
                );
              return (
                <li key={field.key}>
                  <ButtonGroup label={`${field.label} filter`}>
                    {picker}
                    <Button
                      variant="outline"
                      icon="x"
                      iconOnly
                      onClick={() => remove(field.key)}
                    >{`Remove ${field.label} filter`}</Button>
                  </ButtonGroup>
                </li>
              );
            })}
          </ul>
          <Button
            variant="link"
            onClick={() => {
              commit([]);
              setFocusTarget("add");
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
};
