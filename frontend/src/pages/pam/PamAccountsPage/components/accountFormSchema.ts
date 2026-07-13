import { FieldValues, Path, UseFormSetError } from "react-hook-form";
import axios from "axios";
import { z } from "zod";

import { PamAccountType, PamFieldWidget, TPamFieldDescriptor } from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";
import { ApiErrorTypes, TApiErrors } from "@app/hooks/api/types";

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
  if (field.defaultValue !== undefined) return field.defaultValue;
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

export const getMissingRequiredFields = (
  fields: TPamFieldDescriptor[],
  values: Record<string, unknown>
): string[] =>
  fields
    .filter((field) => {
      if (field.widget === PamFieldWidget.Boolean || !isFieldVisible(field, values)) return false;
      if (!field.required && !field.secret) return false;
      const value = values[field.key];
      return value === undefined || value === null || String(value).trim() === "";
    })
    .map((field) => field.key);

// Maps backend validation issues onto the known form fields and returns the messages of any issues that couldn't be mapped
export const applyServerValidationErrors = <T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  knownFields: Set<string>
): string[] => {
  if (!axios.isAxiosError(error)) return [];
  const data = error.response?.data as TApiErrors | undefined;
  if (data?.error !== ApiErrorTypes.ValidationError) return [];

  const unmapped: string[] = [];
  data.message.forEach((issue) => {
    const name = issue.path.join(".");
    if (name && knownFields.has(name)) {
      setError(name as Path<T>, { type: "server", message: issue.message });
    } else {
      unmapped.push(issue.message);
    }
  });
  return unmapped;
};
