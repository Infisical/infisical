import { z } from "zod";

import { PamAccountType, PamFieldWidget, TPamFieldDescriptor } from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";

// Shared shape only; per-type connection/credential fields are validated server-side
export const accountFormSchema = z.object({
  accountType: z.nativeEnum(PamAccountType),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  folderId: z.string().min(1, "Folder is required"),
  templateId: z.string().min(1, "Template is required"),
  connectionDetails: z.record(z.unknown()),
  credentials: z.record(z.unknown())
});

export type TAccountFormValues = z.infer<typeof accountFormSchema>;

const defaultForField = (field: TPamFieldDescriptor): unknown => {
  if (field.widget === PamFieldWidget.Boolean) return false;
  if (field.widget === PamFieldWidget.Select) return field.options?.[0]?.value ?? "";
  return "";
};

export const buildDefaultFieldValues = (fields: TPamFieldDescriptor[]): Record<string, unknown> =>
  Object.fromEntries(fields.map((field) => [field.key, defaultForField(field)]));

export const buildEditCredentialValues = (
  fields: TPamFieldDescriptor[],
  existing: Record<string, unknown> = {}
): Record<string, unknown> =>
  Object.fromEntries(
    fields.map((field) => {
      if (field.secret) return [field.key, UNCHANGED_PASSWORD_SENTINEL];
      return [field.key, existing[field.key] ?? defaultForField(field)];
    })
  );

const isFieldVisible = (field: TPamFieldDescriptor, values: Record<string, unknown>) =>
  !field.showWhen || values[field.showWhen.field] === field.showWhen.equals;

// Lightweight required-field check; the backend performs full schema validation
export const areRequiredFieldsFilled = (
  fields: TPamFieldDescriptor[],
  values: Record<string, unknown>
): boolean =>
  fields.every((field) => {
    if (
      !field.required ||
      field.widget === PamFieldWidget.Boolean ||
      !isFieldVisible(field, values)
    )
      return true;
    const value = values[field.key];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
