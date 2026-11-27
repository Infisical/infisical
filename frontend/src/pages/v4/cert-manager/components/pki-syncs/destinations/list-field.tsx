import type { ReactNode } from "react";
import { Combobox, type ComboboxOption } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";

import { errorMessage } from "../../../../access/toast";
import { type PkiSyncFieldName, useDraftField } from "../fields";

export const fetchErrorOf = (
  query: { error: unknown },
  enabled: boolean,
  fallback: string
): string | undefined =>
  enabled && query.error ? (errorMessage(query.error) ?? fallback) : undefined;

export const withCurrent = (
  options: ComboboxOption[],
  value: unknown,
  label?: string
): ComboboxOption[] => {
  if (typeof value !== "string" || !value || options.some((option) => option.value === value))
    return options;
  return [{ value, label: label || value }, ...options];
};

export function ListField({
  name,
  label,
  help,
  description,
  optional,
  disabled,
  placeholder,
  emptyText,
  options,
  loading,
  fetchError,
  clearable,
  currentLabel,
  onSelect
}: {
  name: PkiSyncFieldName;
  label: string;
  help?: ReactNode;
  description?: ReactNode;
  optional?: boolean;
  disabled?: boolean;
  placeholder?: string;
  emptyText?: string;
  options: ComboboxOption[];
  loading?: boolean;
  fetchError?: string;
  clearable?: boolean;
  currentLabel?: string;
  onSelect?: (value: string) => void;
}) {
  const field = useDraftField<unknown>(name);
  const message = field.error ?? fetchError;
  return (
    <Field label={label} help={help} description={description} optional={optional} error={message}>
      <Combobox
        label={label}
        value={typeof field.value === "string" ? field.value : ""}
        onValueChange={(value) => {
          if (value === field.value) return;
          field.onChange(value);
          onSelect?.(value);
        }}
        options={withCurrent(options, field.value, currentLabel)}
        placeholder={placeholder}
        emptyText={emptyText}
        loading={loading}
        clearable={clearable}
        disabled={disabled}
        invalid={Boolean(message)}
      />
    </Field>
  );
}
