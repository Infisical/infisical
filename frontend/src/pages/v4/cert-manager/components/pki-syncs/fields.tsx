import type { ReactNode } from "react";
import { Controller, type FieldPath, useFormContext, useWatch } from "react-hook-form";
import { Combobox, type ComboboxOption } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Select, type SelectOption } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";
import { Textarea } from "@infisical/cipher/ui/textarea";

import type { TPkiSyncForm } from "@app/components/pki-syncs/forms/schemas/pki-sync-schema";

export type PkiSyncFieldName = FieldPath<TPkiSyncForm> | (string & {});

export const usePkiSyncForm = () => useFormContext<TPkiSyncForm>();

export const useWatchedValue = <T,>(name: PkiSyncFieldName) => {
  const { control } = usePkiSyncForm();
  return useWatch({ control, name: name as FieldPath<TPkiSyncForm> }) as T;
};

export const useConnectionId = () => useWatchedValue<string | undefined>("connection.id");

type BaseProps = {
  name: PkiSyncFieldName;
  label: ReactNode;
  help?: ReactNode;
  description?: ReactNode;
  optional?: boolean;
  disabled?: boolean;
};

export const errorOf = (error?: { message?: string; root?: { message?: string } }) =>
  error?.message ?? error?.root?.message;

export function TextField({
  name,
  label,
  help,
  description,
  optional,
  disabled,
  placeholder,
  maxLength,
  numeric,
  multiline,
  rows,
  mono,
  onValueChange
}: BaseProps & {
  placeholder?: string;
  maxLength?: number;
  numeric?: boolean;
  multiline?: boolean;
  rows?: number;
  mono?: boolean;
  onValueChange?: (value: string) => void;
}) {
  const { control } = usePkiSyncForm();
  return (
    <Controller
      control={control}
      name={name as FieldPath<TPkiSyncForm>}
      render={({ field, fieldState: { error } }) => (
        <Field
          label={label}
          help={help}
          description={description}
          optional={optional}
          error={errorOf(error)}
        >
          {multiline ? (
            <Textarea
              ref={field.ref}
              name={field.name}
              value={(field.value as string | undefined) ?? ""}
              onBlur={field.onBlur}
              onChange={(event) => {
                field.onChange(event.target.value);
                onValueChange?.(event.target.value);
              }}
              placeholder={placeholder}
              rows={rows}
              disabled={disabled}
              aria-invalid={Boolean(error) || undefined}
            />
          ) : (
            <Input
              ref={field.ref}
              name={field.name}
              value={(field.value as string | number | undefined) ?? ""}
              onBlur={field.onBlur}
              onChange={(event) => {
                const { value } = event.target;
                field.onChange(numeric && value !== "" ? Number(value) : value);
                onValueChange?.(value);
              }}
              type={numeric ? "number" : "text"}
              placeholder={placeholder}
              maxLength={maxLength}
              disabled={disabled}
              mono={mono}
              invalid={Boolean(error)}
              autoComplete="off"
            />
          )}
        </Field>
      )}
    />
  );
}

export function SelectField({
  name,
  label,
  help,
  description,
  optional,
  disabled,
  placeholder,
  options,
  onValueChange
}: BaseProps & {
  placeholder?: string;
  options: readonly SelectOption[];
  onValueChange?: (value: string) => void;
}) {
  const { control } = usePkiSyncForm();
  return (
    <Controller
      control={control}
      name={name as FieldPath<TPkiSyncForm>}
      render={({ field, fieldState: { error } }) => (
        <Field
          label={label}
          help={help}
          description={description}
          optional={optional}
          error={errorOf(error)}
        >
          <Select
            aria-label={typeof label === "string" ? label : undefined}
            value={(field.value as string | undefined) ?? ""}
            onValueChange={(value) => {
              field.onChange(value);
              onValueChange?.(value);
            }}
            options={options}
            placeholder={placeholder}
            disabled={disabled}
            invalid={Boolean(error)}
          />
        </Field>
      )}
    />
  );
}

export function ComboField({
  name,
  label,
  help,
  description,
  optional,
  disabled,
  placeholder,
  options,
  emptyText,
  loading,
  mono,
  onCreate,
  createLabel,
  onValueChange
}: BaseProps & {
  label: string;
  placeholder?: string;
  options: readonly ComboboxOption[];
  emptyText?: string;
  loading?: boolean;
  mono?: boolean;
  onCreate?: (query: string) => void;
  createLabel?: (query: string) => string;
  onValueChange?: (value: string) => void;
}) {
  const { control } = usePkiSyncForm();
  return (
    <Controller
      control={control}
      name={name as FieldPath<TPkiSyncForm>}
      render={({ field, fieldState: { error } }) => (
        <Field
          label={label}
          help={help}
          description={description}
          optional={optional}
          error={errorOf(error)}
        >
          <Combobox
            label={label}
            value={field.value === undefined || field.value === null ? "" : String(field.value)}
            onValueChange={(value) => {
              if (value === field.value) return;
              field.onChange(value);
              onValueChange?.(value);
            }}
            options={options}
            placeholder={placeholder}
            emptyText={emptyText}
            loading={loading}
            mono={mono}
            onCreate={onCreate}
            createLabel={createLabel}
            disabled={disabled}
            invalid={Boolean(error)}
          />
        </Field>
      )}
    />
  );
}

export function SwitchField({
  name,
  label,
  description,
  disabled,
  disabledReason,
  onValueChange
}: Omit<BaseProps, "help" | "optional"> & {
  disabledReason?: string;
  onValueChange?: (checked: boolean) => void;
}) {
  const { control } = usePkiSyncForm();
  return (
    <Controller
      control={control}
      name={name as FieldPath<TPkiSyncForm>}
      render={({ field }) => (
        <Switch
          label={label}
          description={description}
          checked={Boolean(field.value)}
          disabled={disabled}
          disabledReason={disabledReason}
          onCheckedChange={(checked) => {
            field.onChange(checked);
            onValueChange?.(checked);
          }}
        />
      )}
    />
  );
}
