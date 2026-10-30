import { z } from "zod";

import {
  DynamicSecretProviders,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";

import {
  createDynamicSecretProviderFormSchema,
  DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  editDynamicSecretProviderFormSchema,
  normalizeDynamicSecretUsernameTemplateForCreate,
  normalizeDynamicSecretUsernameTemplateForEdit
} from "../schemas";
import {
  TCreateDynamicSecretProviderDTO,
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderFormValues,
  TEditDynamicSecretProviderFormContext
} from "../types";

export const ELASTIC_SEARCH_CUSTOM_RENDERER_REASONS = [
  "conditional-fields",
  "repeatable-fields"
] as const;

export const elasticSearchAuthSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user"), username: z.string().trim(), password: z.string().trim() }),
  z.object({ type: z.literal("api-key"), apiKey: z.string().trim(), apiKeyId: z.string().trim() })
]);

export const elasticSearchCreateInputsSchema = z.object({
  host: z.string().trim().min(1),
  port: z.coerce.number(),
  auth: elasticSearchAuthSchema,
  roles: z.array(z.string().trim().min(1)).min(1, "At least one role is required"),
  ca: z.string().optional(),
  sslRejectUnauthorized: z.boolean().default(true)
});
export const elasticSearchEditInputsSchema = elasticSearchCreateInputsSchema.extend({
  sslRejectUnauthorized: z.boolean().optional()
});

export type TElasticSearchFormInputs = z.input<typeof elasticSearchCreateInputsSchema>;
export type TElasticSearchFormValues = TDynamicSecretProviderFormValues<TElasticSearchFormInputs>;

export const elasticSearchCreateFormSchema = createDynamicSecretProviderFormSchema(
  elasticSearchCreateInputsSchema
) as z.ZodType<TElasticSearchFormValues>;
export const elasticSearchEditFormSchema = editDynamicSecretProviderFormSchema(
  elasticSearchEditInputsSchema,
  { usernameTemplateSchema: z.string().trim().nullable().optional() }
) as z.ZodType<TElasticSearchFormValues>;

export const getElasticSearchCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TElasticSearchFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    host: "",
    port: 443,
    auth: { type: "user", username: "", password: "" },
    roles: ["superuser"],
    ca: "",
    sslRejectUnauthorized: true
  }
});

export const getElasticSearchEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TElasticSearchFormValues => ({
  name: context.dynamicSecret.name,
  defaultTTL: context.dynamicSecret.defaultTTL,
  maxTTL: context.dynamicSecret.maxTTL,
  usernameTemplate:
    context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: { ...(context.dynamicSecret.inputs as TElasticSearchFormInputs) }
});

export const getElasticSearchCreatePayload = (
  values: TElasticSearchFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.ElasticSearch> => ({
  provider: {
    type: DynamicSecretProviders.ElasticSearch,
    inputs: elasticSearchCreateInputsSchema.parse(values.inputs)
  },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? "",
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
});

export const getElasticSearchEditPayload = (
  values: TElasticSearchFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || undefined,
    defaultTTL: values.defaultTTL,
    inputs: elasticSearchEditInputsSchema.parse(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
  }
});
