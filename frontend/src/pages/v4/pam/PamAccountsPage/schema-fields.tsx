import type { ClipboardEvent } from "react";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";
import { Textarea } from "@infisical/cipher/ui/textarea";

import {
  PamFieldWidget,
  type TPamAccountTypeMetadata,
  type TPamFieldDescriptor
} from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";

import { useOrgId } from "../../access/permissions";
import {
  applyConnectionString,
  isDescriptionVisible,
  isFieldRequired,
  isFieldVisible,
  resolveForcedRule,
  resolveOrgPlaceholders,
  type TFieldErrors,
  type TFieldGroup,
  type TFieldValues
} from "./account-form";

const asText = (value: unknown) => {
  if (Array.isArray(value)) return value.join("\n");
  if (value === undefined || value === null) return "";
  return String(value);
};

// Write-only: a stored secret keeps the unchanged sentinel until the user types or pastes, and
// clearing the field puts the sentinel back, so focusing it never wipes the stored value.
const SecretField = ({
  value,
  multiline,
  invalid,
  canKeep,
  onChange
}: {
  value: string;
  multiline: boolean;
  invalid: boolean;
  canKeep: boolean;
  onChange: (value: string) => void;
}) => {
  const isUnchanged = value === UNCHANGED_PASSWORD_SENTINEL;
  const shown = isUnchanged ? "" : value;
  const placeholder = isUnchanged ? "Unchanged" : undefined;
  const update = (next: string) =>
    onChange(next === "" && canKeep ? UNCHANGED_PASSWORD_SENTINEL : next);
  if (multiline)
    return (
      <Textarea
        mono
        rows={4}
        value={shown}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        spellCheck={false}
        onChange={(event) => update(event.target.value)}
      />
    );
  return (
    <Input
      type="password"
      autoComplete="new-password"
      value={shown}
      placeholder={placeholder}
      invalid={invalid}
      onChange={(event) => update(event.target.value)}
    />
  );
};

export const SchemaFields = ({
  group,
  metadata,
  values,
  errors,
  keepsSecrets = false,
  onChange,
  onPasteValues
}: {
  group: TFieldGroup;
  metadata: TPamAccountTypeMetadata;
  values: TFieldValues;
  errors: TFieldErrors;
  keepsSecrets?: boolean;
  onChange: (key: string, value: unknown) => void;
  onPasteValues?: (next: TFieldValues) => void;
}) => {
  const orgId = useOrgId();
  const fields =
    group === "connectionDetails" ? metadata.connectionFields : metadata.credentialFields;
  const pasteKey =
    group === "connectionDetails" && (metadata.connectionStringSchemes ?? []).length > 0
      ? fields.find((field) => field.widget === PamFieldWidget.Text)?.key
      : undefined;

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const { value, selectionStart, selectionEnd } = event.currentTarget;
    if (value && !(selectionStart === 0 && selectionEnd === value.length)) return;
    const text = event.clipboardData.getData("text");
    if (!text.trim()) return;
    const next = applyConnectionString(text, metadata, values);
    if (!next) return;
    event.preventDefault();
    onPasteValues?.(next);
  };

  const renderControl = (field: TPamFieldDescriptor, disabled: boolean) => {
    const value = values[group][field.key];
    const invalid = Boolean(errors[`${group}.${field.key}`]);
    if (field.secret)
      return (
        <SecretField
          value={asText(value)}
          multiline={field.widget === PamFieldWidget.Textarea}
          invalid={invalid}
          canKeep={keepsSecrets}
          onChange={(next) => onChange(field.key, next)}
        />
      );
    if (field.widget === PamFieldWidget.Textarea)
      return (
        <Textarea
          rows={4}
          value={asText(value)}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      );
    if (field.widget === PamFieldWidget.Select)
      return (
        <Select
          label={field.label}
          value={asText(value)}
          disabled={disabled}
          invalid={invalid}
          placeholder={`Select ${field.label.toLowerCase()}`}
          options={(field.options ?? []).map((option) => ({
            value: option.value,
            label: option.label
          }))}
          onChange={(next) => onChange(field.key, next)}
        />
      );
    if (field.widget === PamFieldWidget.Number)
      return (
        <Input
          type="number"
          mono
          value={asText(value)}
          disabled={disabled}
          invalid={invalid}
          onChange={(event) =>
            onChange(field.key, event.target.value === "" ? "" : Number(event.target.value))
          }
        />
      );
    return (
      <Input
        value={asText(value)}
        disabled={disabled}
        invalid={invalid}
        autoComplete="off"
        placeholder={
          field.key === pasteKey ? `${field.label}, or paste a connection string` : undefined
        }
        onPaste={field.key === pasteKey ? handlePaste : undefined}
        onChange={(event) => onChange(field.key, event.target.value)}
      />
    );
  };

  return (
    <Stack gap={16}>
      {fields.map((field) => {
        if (!isFieldVisible(field, group, values)) return null;
        const rule = resolveForcedRule(field, group, values);
        const tooltip = rule?.reason ?? field.tooltip;
        const help = tooltip ? resolveOrgPlaceholders(tooltip, orgId) : undefined;
        if (field.widget === PamFieldWidget.Boolean)
          return (
            <Switch
              key={field.key}
              layout="row"
              label={field.label}
              description={
                field.description ? resolveOrgPlaceholders(field.description, orgId) : undefined
              }
              checked={Boolean(values[group][field.key])}
              disabledReason={rule?.reason}
              onChange={(checked) => onChange(field.key, checked)}
            />
          );
        const docsUrl = field.options?.find(
          (option) => option.value === values[group][field.key]
        )?.docsUrl;
        const description =
          [
            field.description && isDescriptionVisible(field, group, values)
              ? resolveOrgPlaceholders(field.description, orgId)
              : undefined,
            rule?.reason
          ]
            .filter(Boolean)
            .join(" ") || undefined;
        return (
          <Field
            key={field.key}
            label={field.label}
            optional={!isFieldRequired(field)}
            help={docsUrl ? <DocumentationLink href={docsUrl} subject={field.label} /> : help}
            description={description}
            error={errors[`${group}.${field.key}`]}
          >
            {renderControl(field, Boolean(rule))}
          </Field>
        );
      })}
    </Stack>
  );
};
