import { format } from "date-fns";
import { AlertTriangleIcon, CalendarIcon, PlusIcon, Trash2Icon } from "lucide-react";

import {
  Button,
  Calendar,
  FilterableSelect,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  UnstableIconButton,
  UnstableInput
} from "@app/components/v3";

import { FILTER_FIELDS, type FilterFieldDefinition, type FilterRule } from "./inventory-types";

type Props = {
  rules: FilterRule[];
  onChange: (rules: FilterRule[]) => void;
  onApply: () => void;
  onCancel: () => void;
  onClearAll: () => void;
  onSaveView?: () => void;
  dynamicFieldOptions?: Record<string, { value: string; label: string }[]>;
};

const getFieldDef = (
  fieldKey: string,
  dynamicOptions?: Record<string, { value: string; label: string }[]>
): FilterFieldDefinition => {
  const baseDef = FILTER_FIELDS.find((f) => f.key === fieldKey);
  if (!baseDef) return FILTER_FIELDS[0];

  if (dynamicOptions && dynamicOptions[fieldKey]) {
    return { ...baseDef, options: dynamicOptions[fieldKey] };
  }
  return baseDef;
};

const parseLocalDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const DatePickerInput = ({
  value,
  onChange
}: {
  value: string | null;
  onChange: (val: string) => void;
}) => {
  const selectedDate = value ? parseLocalDate(value) : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="md"
          data-empty={!value}
          className="w-full justify-start text-left font-normal data-[empty=true]:text-muted"
        >
          <CalendarIcon className="mr-1.5 size-3.5" />
          {selectedDate ? format(selectedDate, "MM/dd/yyyy") : <span>Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (date) {
              onChange(format(date, "yyyy-MM-dd"));
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
};

const isRuleEmpty = (rule: FilterRule): boolean => {
  if (rule.value === null || rule.value === undefined || rule.value === "") return true;
  if (Array.isArray(rule.value) && rule.value.length === 0) return true;
  return false;
};

const FilterRow = ({
  rule,
  onUpdate,
  onRemove,
  dynamicFieldOptions: dynOpts
}: {
  rule: FilterRule;
  onUpdate: (updated: FilterRule) => void;
  onRemove: () => void;
  dynamicFieldOptions?: Record<string, { value: string; label: string }[]>;
}) => {
  const fieldDef = getFieldDef(rule.field, dynOpts);

  const handleFieldChange = (newField: string) => {
    const newDef = getFieldDef(newField, dynOpts);
    onUpdate({
      ...rule,
      field: newField,
      operator: newDef.operators[0]?.value || "is",
      value: newDef.valueType === "multi-select" ? [] : null
    });
  };

  const renderValueInput = () => {
    const options = fieldDef.options || [];

    switch (fieldDef.valueType) {
      case "multi-select": {
        const currentValues = Array.isArray(rule.value) ? rule.value : [];
        const selectedOptions = currentValues
          .map((v) => {
            const opt = options.find((o) => o.value === v);
            return opt ? { value: opt.value, label: opt.label } : null;
          })
          .filter(Boolean) as { value: string; label: string }[];

        return (
          <FilterableSelect
            isMulti
            value={selectedOptions}
            onChange={(opts) => {
              const selected = Array.isArray(opts) ? opts.map((o) => o.value) : [];
              onUpdate({ ...rule, value: selected });
            }}
            options={options}
            placeholder="Select..."
            className="w-full text-sm"
            maxMenuHeight={160}
            menuPortalTarget={document.body}
            menuPosition="fixed"
          />
        );
      }
      case "select":
        return (
          <Select
            value={(rule.value as string) || ""}
            onValueChange={(val: string) => onUpdate({ ...rule, value: val })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "date":
        return (
          <DatePickerInput
            value={(rule.value as string) || null}
            onChange={(val) => onUpdate({ ...rule, value: val })}
          />
        );
      case "number":
        return (
          <UnstableInput
            type="number"
            value={rule.value !== null ? String(rule.value) : ""}
            onChange={(e) =>
              onUpdate({ ...rule, value: e.target.value ? Number(e.target.value) : null })
            }
            placeholder="Value"
            className="w-full"
          />
        );
      default:
        return (
          <UnstableInput
            value={(rule.value as string) || ""}
            onChange={(e) => onUpdate({ ...rule, value: e.target.value })}
            placeholder="Value"
            className="w-full"
          />
        );
    }
  };

  return (
    <div className="flex items-start gap-2">
      <Select value={rule.field} onValueChange={handleFieldChange}>
        <SelectTrigger className="w-[180px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {FILTER_FIELDS.map((f) => (
            <SelectItem key={f.key} value={f.key}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={rule.operator}
        onValueChange={(newOp: string) => onUpdate({ ...rule, operator: newOp })}
      >
        <SelectTrigger className="w-[100px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {fieldDef.operators.map((op) => (
            <SelectItem key={op.value} value={op.value}>
              {op.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="min-w-0 flex-1">{renderValueInput()}</div>

      <UnstableIconButton
        variant="ghost"
        size="xs"
        onClick={onRemove}
        aria-label="Remove filter"
        className="mt-1.5 shrink-0 hover:text-red-400"
      >
        <Trash2Icon />
      </UnstableIconButton>
    </div>
  );
};

export const FilterBuilder = ({
  rules,
  onChange,
  onApply,
  onCancel,
  onClearAll,
  onSaveView,
  dynamicFieldOptions
}: Props) => {
  const hasEmptyRules = rules.some(isRuleEmpty);

  const handleApplyWithValidation = () => {
    onChange(rules.filter((r) => !isRuleEmpty(r)));
    onApply();
  };

  const handleSaveWithValidation = () => {
    onChange(rules.filter((r) => !isRuleEmpty(r)));
    onSaveView?.();
  };

  const handleAddRule = () => {
    const defaultField = FILTER_FIELDS[0];
    onChange([
      ...rules,
      {
        id: crypto.randomUUID(),
        field: defaultField.key,
        operator: defaultField.operators[0]?.value || "is",
        value: defaultField.valueType === "multi-select" ? [] : null
      }
    ]);
  };

  const handleUpdateRule = (index: number, updated: FilterRule) => {
    const newRules = [...rules];
    newRules[index] = updated;
    onChange(newRules);
  };

  const handleRemoveRule = (index: number) => {
    onChange(rules.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Filters</span>
        {rules.length > 0 && (
          <Button variant="ghost" size="xs" onClick={onClearAll} className="h-auto p-0 text-xs">
            Clear all
          </Button>
        )}
      </div>

      {rules.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted">
          No filters applied. Click &quot;Add filter&quot; to get started.
        </p>
      ) : (
        <div className="max-h-[40vh] space-y-1.5 overflow-y-auto">
          {rules.map((rule, index) => (
            <div key={rule.id}>
              {index > 0 && (
                <div className="py-0.5 pl-1 text-[10px] font-medium text-muted uppercase">AND</div>
              )}
              <FilterRow
                rule={rule}
                onUpdate={(updated) => handleUpdateRule(index, updated)}
                onRemove={() => handleRemoveRule(index)}
                dynamicFieldOptions={dynamicFieldOptions}
              />
            </div>
          ))}
        </div>
      )}

      <Button variant="ghost" size="xs" onClick={handleAddRule} className="gap-1">
        <PlusIcon />
        Add filter
      </Button>

      <div className="flex items-center justify-between border-t border-border pt-3">
        {onSaveView && (
          <Button variant="outline" size="xs" onClick={handleSaveWithValidation}>
            Save as View...
          </Button>
        )}
        <div className="flex items-center gap-2">
          {hasEmptyRules && (
            <span className="text-xs text-muted">Empty filters will be ignored</span>
          )}
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="project" size="sm" onClick={handleApplyWithValidation}>
            Apply Filters
          </Button>
        </div>
      </div>
    </div>
  );
};
