import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Label } from "@app/components/v4/ui/label";
import { Stack } from "@app/components/v4/ui/layout";

import css from "./org.module.css";

export type MetadataEntry = { key: string; value: string };

export const metadataErrors = (entries: readonly MetadataEntry[]) =>
  entries.map((entry) => ({
    key: entry.key.trim() ? undefined : "Required",
    value: entry.value.trim() ? undefined : "Required"
  }));

export const MetadataEditor = ({
  entries,
  errors,
  boxed,
  addLabel,
  onChange
}: {
  entries: MetadataEntry[];
  errors?: { key?: string; value?: string }[];
  boxed?: boolean;
  addLabel: string;
  onChange: (entries: MetadataEntry[]) => void;
}) => {
  const set = (index: number, patch: Partial<MetadataEntry>) =>
    onChange(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  const rows = entries.map((entry, index) => (
    <div className={css.metaRow} key={`metadata-${index + 1}`}>
      <Field label={index === 0 ? "Key" : undefined} error={errors?.[index]?.key}>
        <Input
          aria-label={`Metadata key ${index + 1}`}
          value={entry.key}
          invalid={Boolean(errors?.[index]?.key)}
          onChange={(event) => set(index, { key: event.target.value })}
        />
      </Field>
      <Field label={index === 0 ? "Value" : undefined} error={errors?.[index]?.value}>
        <Input
          aria-label={`Metadata value ${index + 1}`}
          value={entry.value}
          invalid={Boolean(errors?.[index]?.value)}
          onChange={(event) => set(index, { value: event.target.value })}
        />
      </Field>
      <Button
        variant="ghost"
        size="icon"
        icon="trash"
        iconOnly
        onClick={() => onChange(entries.filter((_, i) => i !== index))}
      >
        Remove metadata entry
      </Button>
    </div>
  ));
  const add = (
    <span className={boxed ? css.start : css.end}>
      <Button
        variant="ghost"
        size="xs"
        icon="plus"
        onClick={() => onChange([...entries, { key: "", value: "" }])}
      >
        {addLabel}
      </Button>
    </span>
  );
  return (
    <Stack gap={8}>
      <Label>Metadata</Label>
      {boxed ? (
        <div className={css.metaBox} data-empty={entries.length ? undefined : ""}>
          {entries.length ? rows : "No metadata entries. Click below to add."}
        </div>
      ) : (
        rows
      )}
      {add}
    </Stack>
  );
};
