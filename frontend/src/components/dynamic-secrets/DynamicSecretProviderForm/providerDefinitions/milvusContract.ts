import { z } from "zod";

import {
  DynamicSecretProviders,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";

import {
  createDynamicSecretProviderFormSchema,
  DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  editDynamicSecretProviderFormSchema,
  normalizeDynamicSecretUsernameTemplateForCreate
} from "../schemas";
import {
  TCreateDynamicSecretProviderDTO,
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderFormValues,
  TEditDynamicSecretProviderFormContext
} from "../types";

export const MILVUS_CUSTOM_RENDERER_REASONS = [
  "repeatable-fields",
  "permission-aware-fields",
  "remote-options",
  "non-scalar-value"
] as const;

const privilegeSchema = z.object({
  objectType: z.string().trim().min(1),
  objectName: z.string().trim().min(1).default("*"),
  privilege: z.string().trim().min(1),
  dbName: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined))
});

export const milvusCreateInputsSchema = z.object({
  host: z.string().trim().min(1),
  port: z.coerce.number(),
  username: z.string().trim().min(1),
  password: z.string().trim().min(1),
  database: z.string().trim().min(1).default("default"),
  privileges: z.array(privilegeSchema).default([]),
  ca: z.string().optional(),
  sslRejectUnauthorized: z.boolean().default(true),
  gatewayId: z.string().optional(),
  gatewayPoolId: z.string().optional()
});

export const milvusEditInputsSchema = milvusCreateInputsSchema
  .extend({
    sslRejectUnauthorized: z.boolean().optional(),
    gatewayId: z.string().optional().nullable(),
    gatewayPoolId: z.string().optional().nullable()
  })
  .partial();

const metadataSchema = z
  .array(z.object({ key: z.string().trim().min(1), value: z.string().trim().default("") }))
  .optional();

export type TMilvusFormInputs = z.input<typeof milvusCreateInputsSchema>;
export type TMilvusFormValues = TDynamicSecretProviderFormValues<TMilvusFormInputs> & {
  metadata?: { key: string; value: string }[];
};

export const milvusCreateFormSchema = createDynamicSecretProviderFormSchema(
  milvusCreateInputsSchema
) as z.ZodType<TMilvusFormValues>;

export const milvusEditFormSchema = editDynamicSecretProviderFormSchema(milvusEditInputsSchema, {
  usernameTemplateSchema: z.string().trim().nullable().optional()
}).extend({ metadata: metadataSchema }) as z.ZodType<TMilvusFormValues>;

export const getMilvusCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TMilvusFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    host: "http://localhost",
    port: 19530,
    username: "root",
    password: "",
    database: "default",
    privileges: [],
    ca: "",
    sslRejectUnauthorized: true
  }
});

export const getMilvusEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TMilvusFormValues => ({
  name: context.dynamicSecret.name,
  defaultTTL: context.dynamicSecret.defaultTTL,
  maxTTL: context.dynamicSecret.maxTTL || undefined,
  metadata: context.dynamicSecret.metadata,
  usernameTemplate: context.dynamicSecret.usernameTemplate,
  inputs: {
    ...(context.dynamicSecret.inputs as TMilvusFormInputs),
    privileges: (context.dynamicSecret.inputs as TMilvusFormInputs)?.privileges ?? []
  }
});

export const getMilvusCreatePayload = (
  values: TMilvusFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.Milvus> => ({
  provider: {
    type: DynamicSecretProviders.Milvus,
    inputs: milvusCreateInputsSchema.parse(values.inputs)
  },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? "",
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
});

export const getMilvusEditPayload = (
  values: TMilvusFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    defaultTTL: values.defaultTTL,
    maxTTL: values.maxTTL || undefined,
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    metadata: values.metadata,
    usernameTemplate:
      !values.usernameTemplate ||
      values.usernameTemplate === DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE
        ? undefined
        : values.usernameTemplate,
    inputs: {
      ...milvusEditInputsSchema.parse(values.inputs),
      gatewayId: values.inputs.gatewayId ?? null,
      gatewayPoolId: values.inputs.gatewayPoolId ?? null
    }
  }
});
