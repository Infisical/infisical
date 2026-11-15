import axios from "axios";

import {
  PamFieldWidget,
  type TPamAccountTypeMetadata,
  type TPamFieldCondition,
  type TPamFieldDescriptor
} from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";
import { ApiErrorTypes, type TApiErrors } from "@app/hooks/api/types";

import { parseConnectionString } from "./parse-connection-string";

export type TFieldGroup = "connectionDetails" | "credentials";
export type TFieldValues = Record<TFieldGroup, Record<string, unknown>>;
export type TFieldErrors = Record<string, string>;

export const REQUIRED = "Required";
const GROUPS = ["connectionDetails", "credentials"] as const;

const fieldsOf = (metadata: TPamAccountTypeMetadata, group: TFieldGroup) =>
  group === "connectionDetails" ? metadata.connectionFields : metadata.credentialFields;

const emptyForField = (field: TPamFieldDescriptor): unknown => {
  if (field.widget === PamFieldWidget.Boolean) return false;
  if (field.widget === PamFieldWidget.Select) return field.options?.[0]?.value ?? "";
  return "";
};

export const buildDefaultFieldValues = (fields: TPamFieldDescriptor[]) =>
  Object.fromEntries(
    fields.map((field) => [
      field.key,
      field.defaultValue !== undefined ? field.defaultValue : emptyForField(field)
    ])
  );

export const buildEditFieldValues = (
  fields: TPamFieldDescriptor[],
  existing: Record<string, unknown> = {}
) =>
  Object.fromEntries(
    fields.map((field) => [field.key, existing[field.key] ?? emptyForField(field)])
  );

export const buildEditCredentialValues = (
  fields: TPamFieldDescriptor[],
  existing: Record<string, unknown> = {}
) =>
  Object.fromEntries(
    fields.map((field) =>
      field.secret
        ? [field.key, UNCHANGED_PASSWORD_SENTINEL]
        : [field.key, existing[field.key] ?? emptyForField(field)]
    )
  );

// zod's .default() fires on undefined, not "", so keys the account never had must stay absent.
export const omitUnsetAbsentFields = (
  values: Record<string, unknown>,
  existing: Record<string, unknown> = {}
) =>
  Object.fromEntries(
    Object.entries(values).filter(([key, value]) => value !== "" || existing[key] !== undefined)
  );

export const filterUnchangedCredentials = (credentials: Record<string, unknown>) => {
  const entries = Object.entries(credentials);
  const changed = entries.filter(([, value]) => value !== UNCHANGED_PASSWORD_SENTINEL);
  if (changed.length === entries.length) return credentials;
  if (!changed.some(([key]) => key !== "authMethod")) return null;
  return Object.fromEntries(changed);
};

// A condition reads its own group unless the reference is qualified, since a connection detail can
// depend on how the account authenticates.
const conditionHolds = (
  condition: TPamFieldCondition,
  group: TFieldGroup,
  values: TFieldValues
) => {
  const separator = condition.field.indexOf(".");
  const [targetGroup, key] =
    separator === -1
      ? [group, condition.field]
      : [condition.field.slice(0, separator) as TFieldGroup, condition.field.slice(separator + 1)];
  return values[targetGroup]?.[key] === condition.equals;
};

export const resolveForcedRule = (
  field: TPamFieldDescriptor,
  group: TFieldGroup,
  values: TFieldValues
) => field.forceWhen?.find((rule) => conditionHolds(rule.when, group, values));

export const isFieldVisible = (
  field: TPamFieldDescriptor,
  group: TFieldGroup,
  values: TFieldValues
) => !field.showWhen || conditionHolds(field.showWhen, group, values);

export const isDescriptionVisible = (
  field: TPamFieldDescriptor,
  group: TFieldGroup,
  values: TFieldValues
) => !field.descriptionWhen || conditionHolds(field.descriptionWhen, group, values);

export const isFieldRequired = (field: TPamFieldDescriptor) =>
  field.required || (field.secret && !field.optional);

// The server applies forced values too, so this only keeps the form honest about what it saves.
export const applyForcedRules = (metadata: TPamAccountTypeMetadata, values: TFieldValues) => {
  let next = values;
  GROUPS.forEach((group) => {
    fieldsOf(metadata, group).forEach((field) => {
      const rule = resolveForcedRule(field, group, next);
      if (rule && next[group][field.key] !== rule.value)
        next = { ...next, [group]: { ...next[group], [field.key]: rule.value } };
    });
  });
  return next;
};

export const missingFieldErrors = (metadata: TPamAccountTypeMetadata, values: TFieldValues) => {
  const errors: TFieldErrors = {};
  GROUPS.forEach((group) => {
    fieldsOf(metadata, group).forEach((field) => {
      if (field.widget === PamFieldWidget.Boolean || !isFieldVisible(field, group, values)) return;
      if (!isFieldRequired(field)) return;
      const value = values[group][field.key];
      if (value === undefined || value === null || String(value).trim() === "")
        errors[`${group}.${field.key}`] = REQUIRED;
    });
  });
  return errors;
};

export const knownFieldsFor = (metadata: TPamAccountTypeMetadata) =>
  new Set([
    "name",
    "description",
    "folderId",
    "templateId",
    ...GROUPS.flatMap((group) => fieldsOf(metadata, group).map((field) => `${group}.${field.key}`))
  ]);

export const serverFieldErrors = (error: unknown, knownFields: Set<string>) => {
  const fields: TFieldErrors = {};
  const unmapped: string[] = [];
  if (!axios.isAxiosError(error)) return { fields, unmapped };
  const data = error.response?.data as TApiErrors | undefined;
  if (data?.error !== ApiErrorTypes.ValidationError) return { fields, unmapped };
  data.message.forEach((issue) => {
    const name = issue.path.join(".");
    if (name && knownFields.has(name)) fields[name] = issue.message;
    else unmapped.push(issue.message);
  });
  return { fields, unmapped };
};

export const applyConnectionString = (
  text: string,
  metadata: TPamAccountTypeMetadata,
  values: TFieldValues
): TFieldValues | null => {
  const parsed = parseConnectionString(text, metadata.connectionStringSchemes ?? []);
  if (!parsed) return null;
  let next = values;
  let applied = false;
  Object.entries(parsed).forEach(([key, value]) => {
    const group = GROUPS.find((candidate) =>
      fieldsOf(metadata, candidate).some((field) => field.key === key)
    );
    if (!group) return;
    next = { ...next, [group]: { ...next[group], [key]: value } };
    applied = true;
  });
  return applied ? next : null;
};

export const resolveOrgPlaceholders = (text: string, orgId: string) =>
  text
    .replace(/\{\{organizationId\}\}/g, orgId)
    .replace(/\{\{organizationIdPrefix\}\}/g, orgId.split("-").slice(0, 2).join("-"));
