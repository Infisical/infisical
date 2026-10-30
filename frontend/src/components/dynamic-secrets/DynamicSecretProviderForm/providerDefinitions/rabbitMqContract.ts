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

export const RABBIT_MQ_CUSTOM_RENDERER_REASONS = ["repeatable-fields", "non-scalar-value"] as const;

export const rabbitMqCreateInputsSchema = z.object({
  host: z.string().trim().min(1),
  port: z.coerce.number(),
  username: z.string(),
  password: z.string(),
  tags: z.array(z.string().trim()),
  virtualHost: z.object({
    name: z.string().trim().min(1),
    permissions: z.object({
      read: z.string().trim().min(1),
      write: z.string().trim().min(1),
      configure: z.string().trim().min(1)
    })
  }),
  ca: z.string().optional(),
  sslRejectUnauthorized: z.boolean().default(true)
});

export const rabbitMqEditInputsSchema = rabbitMqCreateInputsSchema.extend({
  sslRejectUnauthorized: z.boolean().optional()
});

export type TRabbitMqFormInputs = z.input<typeof rabbitMqCreateInputsSchema>;
export type TRabbitMqFormValues = TDynamicSecretProviderFormValues<TRabbitMqFormInputs>;

export const rabbitMqCreateFormSchema = createDynamicSecretProviderFormSchema(
  rabbitMqCreateInputsSchema
) as z.ZodType<TRabbitMqFormValues>;
export const rabbitMqEditFormSchema = editDynamicSecretProviderFormSchema(
  rabbitMqEditInputsSchema,
  { usernameTemplateSchema: z.string().trim().nullable().optional() }
) as z.ZodType<TRabbitMqFormValues>;

export const getRabbitMqCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TRabbitMqFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    host: "",
    port: 15672,
    username: "",
    password: "",
    tags: [],
    virtualHost: {
      name: "/",
      permissions: { read: ".*", write: ".*", configure: ".*" }
    },
    ca: "",
    sslRejectUnauthorized: true
  }
});

export const getRabbitMqEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TRabbitMqFormValues => ({
  name: context.dynamicSecret.name,
  defaultTTL: context.dynamicSecret.defaultTTL,
  maxTTL: context.dynamicSecret.maxTTL,
  usernameTemplate:
    context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: { ...(context.dynamicSecret.inputs as TRabbitMqFormInputs) }
});

export const getRabbitMqCreatePayload = (
  values: TRabbitMqFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.RabbitMq> => ({
  provider: {
    type: DynamicSecretProviders.RabbitMq,
    inputs: rabbitMqCreateInputsSchema.parse(values.inputs)
  },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? "",
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
});

export const getRabbitMqEditPayload = (
  values: TRabbitMqFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || undefined,
    defaultTTL: values.defaultTTL,
    inputs: rabbitMqEditInputsSchema.parse(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
  }
});
