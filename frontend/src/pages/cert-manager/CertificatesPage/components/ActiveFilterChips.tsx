import { XIcon } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

import { type FilterRule, getFilterChipLabel, getFilterMultiSelectLabels } from "./inventory-types";

type Props = {
  rules: FilterRule[];
  onRemove: (ruleId: string) => void;
  onClearAll: () => void;
  dynamicFieldOptions?: Record<string, { value: string; label: string }[]>;
};

const FilterChip = ({
  rule,
  onRemove,
  dynamicFieldOptions
}: {
  rule: FilterRule;
  onRemove: () => void;
  dynamicFieldOptions?: Record<string, { value: string; label: string }[]>;
}) => {
  const label = getFilterChipLabel(rule, dynamicFieldOptions);
  const isCollapsed = Array.isArray(rule.value) && rule.value.length > 1;

  const chip = (
    <Badge variant="neutral" className="gap-1.5 pr-1">
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-0.5 text-muted transition-colors hover:text-red-400"
      >
        <XIcon className="size-3" />
      </button>
    </Badge>
  );

  if (!isCollapsed) return chip;

  const expandedLabels = getFilterMultiSelectLabels(rule, dynamicFieldOptions);

  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <ul className="list-none space-y-0.5 text-xs">
          {expandedLabels.map((lbl) => (
            <li key={lbl}>{lbl}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
};

export const ActiveFilterChips = ({ rules, onRemove, onClearAll, dynamicFieldOptions }: Props) => {
  if (rules.length === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted">Active filters:</span>
      {rules.map((rule) => (
        <FilterChip
          key={rule.id}
          rule={rule}
          onRemove={() => onRemove(rule.id)}
          dynamicFieldOptions={dynamicFieldOptions}
        />
      ))}
      <button type="button" onClick={onClearAll}>
        <Badge variant="ghost" className="cursor-pointer">
          Clear all
        </Badge>
      </button>
    </div>
  );
};
