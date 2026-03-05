import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton, Input } from "@app/components/v2";

export type MetadataFilterEntry = {
  id: string;
  key: string;
  value: string;
};

type Props = {
  entries: MetadataFilterEntry[];
  onChange: (entries: MetadataFilterEntry[]) => void;
};

export const MetadataFilterSection = ({ entries, onChange }: Props) => {
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
        <span className="text-xs font-medium text-bunker-300 uppercase">Metadata</span>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="cursor-pointer text-xs text-primary hover:text-primary-600"
          >
            Clear
          </button>
        )}
      </div>
      {entries.map((entry, idx) => (
        <div key={entry.id} className="flex items-center gap-1">
          <Input
            value={entry.key}
            onChange={(e) => updateEntry(idx, "key", e.target.value)}
            placeholder="Key"
            className="flex-1"
          />
          <Input
            value={entry.value}
            onChange={(e) => updateEntry(idx, "value", e.target.value)}
            placeholder="Value"
            className="flex-1"
          />
          <IconButton
            ariaLabel="Remove metadata filter"
            variant="plain"
            size="xs"
            onClick={() => removeEntry(idx)}
          >
            <FontAwesomeIcon icon={faTrash} size="xs" />
          </IconButton>
        </div>
      ))}
      <IconButton
        ariaLabel="Add metadata filter"
        variant="outline_bg"
        size="xs"
        className="rounded-md"
        onClick={addEntry}
      >
        <FontAwesomeIcon icon={faPlus} />
      </IconButton>
    </div>
  );
};
