import { PlusIcon, TrashIcon } from "lucide-react";

import { FieldError, IconButton, Input } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

export type MetadataFilterEntry = {
  id: string;
  key: string;
  value: string;
};

type Props = {
  entries: MetadataFilterEntry[];
  onChange: (entries: MetadataFilterEntry[]) => void;
  labelClassName?: string;
  clearClassName?: string;
  errors?: (string | undefined)[];
  maxEntries?: number;
};

export const MetadataFilterSection = ({
  entries,
  onChange,
  labelClassName,
  clearClassName,
  errors,
  maxEntries
}: Props) => {
  const updateEntry = (idx: number, field: "key" | "value", val: string) => {
    const updated = [...entries];
    updated[idx] = { ...updated[idx], [field]: val };
    onChange(updated);
  };

  const removeEntry = (idx: number) => {
    onChange(entries.filter((_, i) => i !== idx));
  };

  const addEntry = () => {
    onChange([...entries, { id: crypto.randomUUID(), key: "", value: "" }]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-medium text-label-secondary uppercase", labelClassName)}>
          Metadata
        </span>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className={cn("cursor-pointer text-xs text-project hover:text-project", clearClassName)}
          >
            Clear
          </button>
        )}
      </div>
      {entries.map((entry, idx) => (
        <div key={entry.id} className="space-y-1">
          <div className="flex items-center gap-1">
            <Input
              value={entry.key}
              onChange={(e) => updateEntry(idx, "key", e.target.value)}
              placeholder="Key"
              className="flex-1"
              isError={Boolean(errors?.[idx])}
            />
            <Input
              value={entry.value}
              onChange={(e) => updateEntry(idx, "value", e.target.value)}
              placeholder="Value"
              className="flex-1"
              isError={Boolean(errors?.[idx])}
            />
            <IconButton
              aria-label="Remove metadata filter"
              variant="ghost"
              size="xs"
              onClick={() => removeEntry(idx)}
            >
              <TrashIcon />
            </IconButton>
          </div>
          {errors?.[idx] && <FieldError>{errors[idx]}</FieldError>}
        </div>
      ))}
      {(maxEntries === undefined || entries.length < maxEntries) && (
        <IconButton aria-label="Add metadata filter" variant="outline" size="xs" onClick={addEntry}>
          <PlusIcon />
        </IconButton>
      )}
    </div>
  );
};
