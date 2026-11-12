import { cloneElement, isValidElement, type ReactElement, type ReactNode, useId } from "react";
import { Controller, type FieldValues, useFormContext, useWatch } from "react-hook-form";
import { FieldMapping, FieldMappingRow } from "@infisical/cipher/patterns/field-mapping";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { CodeBlock } from "@infisical/cipher/ui/code-block";
import { Combobox, type ComboboxOption } from "@infisical/cipher/ui/combobox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet
} from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Grid, Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { Select, type SelectOption } from "@infisical/cipher/ui/select";
import { CopyButton } from "@infisical/cipher/ui/sensitive-editor";
import { Switch } from "@infisical/cipher/ui/switch";
import { Heading, SmallText } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { Tooltip } from "@infisical/cipher/ui/tooltip";

import type { V4QueryResult } from "../../../../../data/contract";
import { DEFAULT_PASSWORD_REQUIREMENTS } from "./schemas";

import styles from "../flows.module.css";

export type RotationViews = {
  Parameters: () => ReactNode;
  Mappings: () => ReactNode;
  Review: () => ReactNode;
};

export const useRotationForm = () => useFormContext<FieldValues>();

export const useIsUpdate = () => {
  const { control } = useRotationForm();
  return Boolean(useWatch({ control, name: "id" }));
};

export const useConnectionId = () => {
  const { control } = useRotationForm();
  return useWatch({ control, name: "connection.id" }) as string | undefined;
};

export const useConnectionOptions = <T,>(
  useList: (connectionId: string, options?: { enabled?: boolean }) => V4QueryResult<T[]>
) => {
  const connectionId = useConnectionId();
  return useList(connectionId ?? "", { enabled: Boolean(connectionId) }).data ?? [];
};

export function InfoTip({ content }: { content: ReactNode }) {
  return (
    <Tooltip content={content}>
      <Button type="button" variant="ghost" size="icon-xs" aria-label="More information">
        <Icon name="info" />
      </Button>
    </Tooltip>
  );
}

export function RotationField({
  label,
  tooltip,
  optional,
  description,
  error,
  children
}: {
  label: ReactNode;
  tooltip?: ReactNode;
  optional?: boolean;
  description?: ReactNode;
  error?: string;
  children: ReactElement<Record<string, unknown>>;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-invalid": Boolean(error) || undefined,
        "aria-describedby": error || description ? noteId : undefined
      })
    : children;
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <Inline gap={4} wrap={false}>
        <FieldLabel htmlFor={id}>
          {label}
          {optional && " (optional)"}
        </FieldLabel>
        {tooltip && <InfoTip content={tooltip} />}
      </Inline>
      {control}
      {error ? (
        <FieldError id={noteId}>{error}</FieldError>
      ) : (
        description && <FieldDescription id={noteId}>{description}</FieldDescription>
      )}
    </Field>
  );
}

export function TextField({
  name,
  label,
  tooltip,
  optional,
  description,
  placeholder,
  type,
  maxLength,
  disabled,
  numeric,
  multiline,
  rows,
  defaultValue
}: {
  name: string;
  label: ReactNode;
  tooltip?: ReactNode;
  optional?: boolean;
  description?: ReactNode;
  placeholder?: string;
  type?: string;
  maxLength?: number;
  disabled?: boolean;
  numeric?: boolean;
  multiline?: boolean;
  rows?: number;
  defaultValue?: unknown;
}) {
  const { control } = useRotationForm();
  return (
    <Controller
      control={control}
      name={name}
      defaultValue={defaultValue}
      render={({ field, fieldState: { error } }) => (
        <RotationField
          label={label}
          tooltip={tooltip}
          optional={optional}
          description={description}
          error={error?.message}
        >
          {multiline ? (
            <Textarea
              ref={field.ref}
              name={field.name}
              value={field.value ?? ""}
              onBlur={field.onBlur}
              onChange={field.onChange}
              placeholder={placeholder}
              rows={rows}
              disabled={disabled}
            />
          ) : (
            <Input
              ref={field.ref}
              name={field.name}
              value={field.value ?? ""}
              onBlur={field.onBlur}
              onChange={(event) => {
                const { value } = event.target;
                field.onChange(numeric && value !== "" ? Number(value) : value);
              }}
              type={type ?? (numeric ? "number" : "text")}
              placeholder={placeholder}
              maxLength={maxLength}
              disabled={disabled}
              autoComplete="off"
            />
          )}
        </RotationField>
      )}
    />
  );
}

export function SelectField({
  name,
  label,
  tooltip,
  optional,
  description,
  placeholder,
  options,
  defaultValue
}: {
  name: string;
  label: ReactNode;
  tooltip?: ReactNode;
  optional?: boolean;
  description?: ReactNode;
  placeholder?: string;
  options: SelectOption[];
  defaultValue?: string;
}) {
  const { control } = useRotationForm();
  return (
    <Controller
      control={control}
      name={name}
      defaultValue={defaultValue}
      render={({ field, fieldState: { error } }) => (
        <RotationField
          label={label}
          tooltip={tooltip}
          optional={optional}
          description={description}
          error={error?.message}
        >
          <Select
            value={field.value ?? ""}
            onValueChange={field.onChange}
            options={options}
            placeholder={placeholder}
            invalid={Boolean(error)}
          />
        </RotationField>
      )}
    />
  );
}

export function ResourceComboboxField({
  name,
  label,
  tooltip,
  description,
  placeholder,
  options,
  onSelect,
  requiresConnection = true
}: {
  name: string;
  label: string;
  tooltip?: ReactNode;
  description?: ReactNode;
  placeholder?: string;
  options: ComboboxOption[];
  onSelect?: (value: string) => void;
  requiresConnection?: boolean;
}) {
  const { control } = useRotationForm();
  const connectionId = useConnectionId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <RotationField
          label={label}
          tooltip={tooltip}
          description={description}
          error={error?.message}
        >
          <Combobox
            ref={field.ref}
            label={label}
            value={field.value ?? ""}
            onValueChange={(value) => {
              field.onChange(value);
              onSelect?.(value);
            }}
            options={options}
            placeholder={placeholder}
            disabled={requiresConnection && !connectionId}
            invalid={Boolean(error)}
          />
        </RotationField>
      )}
    />
  );
}

export function SwitchField({
  name,
  label,
  description,
  defaultValue
}: {
  name: string;
  label: string;
  description?: string;
  defaultValue?: boolean;
}) {
  const { control } = useRotationForm();
  return (
    <Controller
      control={control}
      name={name}
      defaultValue={defaultValue}
      render={({ field }) => (
        <Switch
          ref={field.ref}
          label={label}
          description={description}
          layout="row"
          checked={Boolean(field.value)}
          onCheckedChange={field.onChange}
        />
      )}
    />
  );
}

export const notListedHint = (text: string, tooltip: ReactNode) => (
  <Inline gap={4} wrap={false}>
    <span>{text}</span>
    <InfoTip content={tooltip} />
  </Inline>
);

export function SecretsMappingFields({
  items
}: {
  items: { name: string; key: string; placeholder?: string }[];
}) {
  const { control } = useRotationForm();
  return (
    <FieldMapping
      legend="Rotated credential mappings"
      sourceHeader="Rotated credentials"
      targetHeader="Secret name"
      targetHint={
        <InfoTip content="The name of the secret that the active credentials will be mapped to." />
      }
    >
      {items.map((item) => (
        <Controller
          key={item.key}
          control={control}
          name={`secretsMapping.${item.key}`}
          render={({ field, fieldState: { error } }) => (
            <FieldMappingRow
              source={item.name}
              icon="key"
              ref={field.ref}
              name={field.name}
              value={field.value ?? ""}
              onBlur={field.onBlur}
              onChange={field.onChange}
              placeholder={item.placeholder}
              error={error?.message}
              autoComplete="off"
            />
          )}
        />
      ))}
    </FieldMapping>
  );
}

const PASSWORD_FIELDS = [
  ["length", "Password Length"],
  ["required.digits", "Digit Count"],
  ["required.lowercase", "Lowercase Character Count"],
  ["required.uppercase", "Uppercase Character Count"],
  ["required.symbols", "Symbol Count"]
] as const;

type PasswordRequirementsDefaults = Omit<typeof DEFAULT_PASSWORD_REQUIREMENTS, "allowedSymbols"> & {
  allowedSymbols?: string;
};

export function PasswordRequirementsFields({
  defaultRequirements = DEFAULT_PASSWORD_REQUIREMENTS
}: {
  defaultRequirements?: PasswordRequirementsDefaults;
}) {
  const valueAt = (path: string) =>
    path
      .split(".")
      .reduce<unknown>(
        (node, key) => (node as Record<string, unknown> | undefined)?.[key],
        defaultRequirements
      );
  return (
    <FieldSet>
      <FieldLegend variant="label">Password Requirements</FieldLegend>
      <Grid columns={2} gap={16}>
        {PASSWORD_FIELDS.map(([path, label]) => (
          <TextField
            key={path}
            name={`parameters.passwordRequirements.${path}`}
            label={label}
            numeric
            defaultValue={valueAt(path)}
          />
        ))}
        <TextField
          name="parameters.passwordRequirements.allowedSymbols"
          label="Allowed Symbols"
          placeholder="-_.~!*"
          defaultValue={defaultRequirements.allowedSymbols}
        />
      </Grid>
    </FieldSet>
  );
}

export function CreateUserStatementAlert({ statement }: { statement: string }) {
  return (
    <Alert tone="info" title="Example Create User Statement">
      <Stack gap={12}>
        <p>
          Rotation needs two database users that only Infisical manages. Changing their login after
          rotation can break it. Adapt this example as needed.
        </p>
        <div className={styles.statement}>
          <CodeBlock
            code={statement}
            copyable={false}
            wrap
            maxLines={8}
            style={{ paddingInlineEnd: "var(--v4-space-40)" }}
          />
          <span className={styles.statementCopy}>
            <CopyButton value={statement} label="Copy statement" iconOnly />
          </span>
        </div>
      </Stack>
    </Alert>
  );
}

const present = (value: ReactNode) =>
  value !== null && value !== undefined && value !== "" && value !== false;

export function ReviewSection({
  label,
  items
}: {
  label: string;
  items: (readonly [string, ReactNode])[];
}) {
  return (
    <Stack gap={12}>
      <Heading level={3} size="subsection">
        {label}
      </Heading>
      <DataList
        variant="meta"
        items={items.map(([term, value]) => [
          term,
          present(value) ? value : <SmallText muted>None</SmallText>
        ])}
      />
    </Stack>
  );
}

export function PasswordRequirementsReview({
  requirements
}: {
  requirements?: typeof DEFAULT_PASSWORD_REQUIREMENTS;
}) {
  if (!requirements) return null;
  return (
    <ReviewSection
      label="Password Requirements"
      items={[
        ["Length", requirements.length],
        ["Minimum Digits", requirements.required.digits],
        ["Minimum Lowercase Characters", requirements.required.lowercase],
        ["Minimum Uppercase Characters", requirements.required.uppercase],
        ["Minimum Symbols", requirements.required.symbols],
        ["Allowed Symbols", requirements.allowedSymbols]
      ]}
    />
  );
}
