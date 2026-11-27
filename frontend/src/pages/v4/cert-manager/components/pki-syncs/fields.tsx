import { createContext, type ReactNode, use, useCallback, useMemo, useState } from "react";
import { Combobox, type ComboboxOption } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Select, type SelectOption } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";
import { Textarea } from "@infisical/cipher/ui/textarea";

import type { TPkiSyncForm } from "@app/components/pki-syncs/forms/schemas/pki-sync-schema";

import {
  type PkiSyncErrors,
  type PkiSyncFieldName,
  valueAt,
  withoutErrorsAt,
  withValueAt
} from "./draft-values";

export type { PkiSyncErrors, PkiSyncFieldName } from "./draft-values";

type PkiSyncDraft = {
  values: TPkiSyncForm;
  errors: PkiSyncErrors;
  setValue: (name: PkiSyncFieldName, value: unknown) => void;
};

const PkiSyncDraftContext = createContext<PkiSyncDraft | null>(null);

export const usePkiSyncDraftState = (initial: () => TPkiSyncForm) => {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<PkiSyncErrors>({});
  const setValue = useCallback((name: PkiSyncFieldName, value: unknown) => {
    setValues((current) =>
      Object.is(valueAt(current, name), value)
        ? current
        : (withValueAt(current, name.split("."), value) as TPkiSyncForm)
    );
    setErrors((current) => withoutErrorsAt(current, name));
  }, []);
  const draft = useMemo<PkiSyncDraft>(
    () => ({ values, errors, setValue }),
    [values, errors, setValue]
  );
  return { draft, values, setValues, errors, setErrors };
};

export const PkiSyncDraftProvider = ({
  draft,
  children
}: {
  draft: PkiSyncDraft;
  children: ReactNode;
}) => <PkiSyncDraftContext value={draft}>{children}</PkiSyncDraftContext>;

export const usePkiSyncDraft = () => {
  const draft = use(PkiSyncDraftContext);
  if (!draft) throw new Error("usePkiSyncDraft needs a PkiSyncDraftProvider");
  return draft;
};

export const useDraftValue = <T,>(name: PkiSyncFieldName) =>
  valueAt(usePkiSyncDraft().values, name) as T;

export const useDraftField = <T,>(name: PkiSyncFieldName) => {
  const { values, errors, setValue } = usePkiSyncDraft();
  return {
    value: valueAt(values, name) as T,
    error: errors[name],
    onChange: (value: unknown) => setValue(name, value)
  };
};

export const useConnectionId = () => useDraftValue<string | undefined>("connection.id");

type BaseProps = {
  name: PkiSyncFieldName;
  label: ReactNode;
  help?: ReactNode;
  description?: ReactNode;
  optional?: boolean;
  disabled?: boolean;
};

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
  const field = useDraftField<string | number | undefined>(name);
  return (
    <Field
      label={label}
      help={help}
      description={description}
      optional={optional}
      error={field.error}
    >
      {multiline ? (
        <Textarea
          name={name}
          value={(field.value as string | undefined) ?? ""}
          onChange={(event) => {
            field.onChange(event.target.value);
            onValueChange?.(event.target.value);
          }}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          aria-invalid={Boolean(field.error) || undefined}
        />
      ) : (
        <Input
          name={name}
          value={field.value ?? ""}
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
          invalid={Boolean(field.error)}
          autoComplete="off"
        />
      )}
    </Field>
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
  const field = useDraftField<string | undefined>(name);
  return (
    <Field
      label={label}
      help={help}
      description={description}
      optional={optional}
      error={field.error}
    >
      <Select
        aria-label={typeof label === "string" ? label : undefined}
        value={field.value ?? ""}
        onValueChange={(value) => {
          field.onChange(value);
          onValueChange?.(value);
        }}
        options={options}
        placeholder={placeholder}
        disabled={disabled}
        invalid={Boolean(field.error)}
      />
    </Field>
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
  const field = useDraftField<unknown>(name);
  return (
    <Field
      label={label}
      help={help}
      description={description}
      optional={optional}
      error={field.error}
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
        invalid={Boolean(field.error)}
      />
    </Field>
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
  const field = useDraftField<boolean | undefined>(name);
  return (
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
  );
}
