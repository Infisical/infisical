import { faPlus, faTimes, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { IconButton, Input } from "@app/components/v2";

export type MetadataFilterEntry = {
  id: string;
  key: string;
  value: string;
};

type Props = {
  entries: MetadataFilterEntry[];
  onChange: (entries: MetadataFilterEntry[]) => void;
  className?: string;
};

let nextId = 0;

export const createMetadataFilterEntry = (key = "", value = ""): MetadataFilterEntry => {
  nextId += 1;
  return { id: `mf-${Date.now()}-${nextId}`, key, value };
};

export const MetadataFilterSection = ({ entries, onChange, className }: Props) => {
  const handleAdd = () => {
    onChange([...entries, createMetadataFilterEntry()]);
  };

  const handleRemove = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  const handleChange = (id: string, field: "key" | "value", val: string) => {
    onChange(entries.map((e) => (e.id === id ? { ...e, [field]: val } : e)));
  };

  const handleClear = () => {
    onChange([]);
  };

  const stopPropagation = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      role="presentation"
      className={twMerge("flex flex-col gap-2", className)}
      onClick={stopPropagation}
      onKeyDown={stopPropagation}
    >
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-center gap-1">
          <Input
            value={entry.key}
            onChange={(e) => handleChange(entry.id, "key", e.target.value)}
            placeholder="Key"
            size="xs"
            className="flex-1"
          />
          <Input
            value={entry.value}
            onChange={(e) => handleChange(entry.id, "value", e.target.value)}
            placeholder="Value (optional)"
            size="xs"
            className="flex-1"
          />
          <IconButton
            ariaLabel="Remove filter"
            variant="plain"
            size="xs"
            onClick={() => handleRemove(entry.id)}
          >
            <FontAwesomeIcon icon={faTrash} className="text-red-400" />
          </IconButton>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <IconButton
          ariaLabel="Add metadata filter"
          variant="outline_bg"
          size="xs"
          onClick={handleAdd}
        >
          <FontAwesomeIcon icon={faPlus} />
        </IconButton>
        {entries.length > 0 && (
          <IconButton
            ariaLabel="Clear all metadata filters"
            variant="outline_bg"
            size="xs"
            onClick={handleClear}
          >
            <FontAwesomeIcon icon={faTimes} />
          </IconButton>
        )}
      </div>
    </div>
  );
};
