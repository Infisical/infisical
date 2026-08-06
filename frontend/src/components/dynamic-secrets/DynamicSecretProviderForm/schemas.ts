import ms from "ms";
import { z } from "zod";

import { slugSchema } from "@app/lib/schemas";

import type { TDynamicSecretProviderFormMode } from "./types";

export const DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE = "{{randomUsername}}";

export const dynamicSecretTtlSchema = z.string().superRefine((value, context) => {
  const valueInMilliseconds = ms(value);

  if (valueInMilliseconds < 60 * 1000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "TTL must be a greater than 1min"
    });
  }

  if (valueInMilliseconds > ms("10y")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "TTL must be less than 10 years"
    });
  }
});

export const optionalDynamicSecretTtlSchema = z
  .string()
  .optional()
  .superRefine((value, context) => {
    if (!value) return;

    const valueInMilliseconds = ms(value);

    if (valueInMilliseconds < 60 * 1000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TTL must be a greater than 1min"
      });
    }

    if (valueInMilliseconds > ms("10y")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TTL must be less than 10 years"
      });
    }
  });

const environmentSchema = z.object({
  name: z.string(),
  slug: z.string()
});

type TDynamicSecretFormSchemaOptions = {
  usernameTemplateSchema?: z.ZodTypeAny;
};

export const createDynamicSecretProviderFormSchema = <TInputs extends z.ZodTypeAny>(
  inputsSchema: TInputs,
  options: TDynamicSecretFormSchemaOptions = {}
) =>
  z.object({
    name: slugSchema(),
    defaultTTL: dynamicSecretTtlSchema,
    maxTTL: optionalDynamicSecretTtlSchema,
    environment: environmentSchema,
    usernameTemplate: options.usernameTemplateSchema ?? z.string().nullable().optional(),
    inputs: inputsSchema
  });

export const editDynamicSecretProviderFormSchema = <TInputs extends z.ZodTypeAny>(
  inputsSchema: TInputs,
  options: TDynamicSecretFormSchemaOptions = {}
) =>
  z.object({
    name: slugSchema(),
    defaultTTL: dynamicSecretTtlSchema,
    maxTTL: optionalDynamicSecretTtlSchema.nullable(),
    environment: environmentSchema.optional(),
    usernameTemplate: options.usernameTemplateSchema ?? z.string().nullable().optional(),
    inputs: inputsSchema
  });

export const normalizeDynamicSecretUsernameTemplateForCreate = (
  usernameTemplate?: string | null
) =>
  !usernameTemplate || usernameTemplate === DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE
    ? undefined
    : usernameTemplate;

export const normalizeDynamicSecretUsernameTemplateForEdit = (usernameTemplate?: string | null) =>
  !usernameTemplate || usernameTemplate === DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE
    ? null
    : usernameTemplate;

/** Create omits a cleared gateway; edit sends null to detach an existing gateway. */
export const normalizeDynamicSecretGatewayValueForMode = (
  mode: TDynamicSecretProviderFormMode,
  value?: string | null
) => value || (mode === "create" ? undefined : null);
