import type { ReactNode } from "react";
import { Controller, type FieldPath } from "react-hook-form";
import { Combobox, type ComboboxOption } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";

import type { TPkiSyncForm } from "@app/components/pki-syncs/forms/schemas/pki-sync-schema";

import { errorMessage } from "../../../../access/toast";
import { errorOf, type PkiSyncFieldName, usePkiSyncForm } from "../fields";

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
  const { control } = usePkiSyncForm();
  return (
    <Controller
      control={control}
      name={name as FieldPath<TPkiSyncForm>}
      render={({ field, fieldState: { error } }) => {
        const message = errorOf(error) ?? fetchError;
        return (
          <Field
            label={label}
            help={help}
            description={description}
            optional={optional}
            error={message}
          >
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
      }}
    />
  );
}
