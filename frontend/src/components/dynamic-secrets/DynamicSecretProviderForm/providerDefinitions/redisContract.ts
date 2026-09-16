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

export const REDIS_CREATION_STATEMENT = "ACL SETUSER {{username}} on >{{password}} ~* &* +@all";
export const REDIS_REVOCATION_STATEMENT = "ACL DELUSER {{username}}";

export const redisCreateInputsSchema = z.object({
  host: z.string().toLowerCase().min(1),
  port: z.number(),
  username: z.string().min(1),
  password: z.string().min(1).optional(),
  creationStatement: z.string().min(1),
  renewStatement: z.string().optional(),
  revocationStatement: z.string().min(1),
  ca: z.string().optional(),
  sslRejectUnauthorized: z.boolean().default(true)
});

export const redisEditInputsSchema = redisCreateInputsSchema.partial();

export type TRedisCreateInputs = z.infer<typeof redisCreateInputsSchema>;
export type TRedisEditInputs = z.infer<typeof redisEditInputsSchema>;
export type TRedisCreateFormValues = TDynamicSecretProviderFormValues<TRedisCreateInputs>;
export type TRedisEditFormValues = TDynamicSecretProviderFormValues<TRedisEditInputs>;

export const redisCreateFormSchema = createDynamicSecretProviderFormSchema(
  redisCreateInputsSchema
) as z.ZodType<TRedisCreateFormValues>;

export const redisEditFormSchema = editDynamicSecretProviderFormSchema(redisEditInputsSchema, {
  usernameTemplateSchema: z.string().trim().nullable().optional()
}) as z.ZodType<TRedisEditFormValues>;

export const getRedisCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TRedisCreateFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    host: "",
    port: 6379,
    username: "default",
    password: undefined,
    creationStatement: REDIS_CREATION_STATEMENT,
    renewStatement: undefined,
    revocationStatement: REDIS_REVOCATION_STATEMENT,
    ca: undefined,
    sslRejectUnauthorized: true
  }
});

export const getRedisEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TRedisEditFormValues => ({
  name: context.dynamicSecret.name,
  defaultTTL: context.dynamicSecret.defaultTTL,
  maxTTL: context.dynamicSecret.maxTTL,
  usernameTemplate:
    context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: { ...(context.dynamicSecret.inputs as TRedisEditInputs) }
});

export const getRedisCreatePayload = (
  values: TRedisCreateFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.Redis> => ({
  provider: {
    type: DynamicSecretProviders.Redis,
    inputs: redisCreateInputsSchema.parse(values.inputs)
  },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? "",
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
});

export const getRedisEditPayload = (
  values: TRedisEditFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate),
    maxTTL: values.maxTTL || undefined,
    defaultTTL: values.defaultTTL,
    inputs: redisEditInputsSchema.parse(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name
  }
});
