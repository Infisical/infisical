import { z } from "zod";

import {
  AwsMemoryDbAuthType,
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

export const ELASTICACHE_CREATION_STATEMENT = `{
        "UserId": "{{username}}",
        "UserName": "{{username}}",
        "Engine": "redis",
        "Passwords": ["{{password}}"],
        "AccessString": "on ~* +@all"
}`;

export const ELASTICACHE_REVOCATION_STATEMENT = `{
        "UserId": "{{username}}"
}`;

export const MEMORYDB_CREATION_STATEMENT = `{
        "UserName": "{{username}}",
        "AccessString": "on ~* +@all",
        "AuthenticationMode": { "Type": "password", "Passwords": ["{{password}}"] }
}`;

export const MEMORYDB_REVOCATION_STATEMENT = `{
        "UserName": "{{username}}"
}`;

export const awsElastiCacheCreateInputsSchema = z.object({
  clusterName: z.string().trim().min(1),
  accessKeyId: z.string().trim().min(1),
  secretAccessKey: z.string().trim().min(1),
  region: z.string().trim(),
  creationStatement: z.string().trim(),
  revocationStatement: z.string().trim()
});

export const awsElastiCacheEditInputsSchema = awsElastiCacheCreateInputsSchema.partial();

export const awsMemoryDbCreateInputsSchema = z.object({
  clusterName: z.string().trim().min(1),
  region: z.string().trim().min(1),
  auth: z.discriminatedUnion("type", [
    z.object({
      type: z.literal(AwsMemoryDbAuthType.IAM),
      accessKeyId: z.string().trim().min(1),
      secretAccessKey: z.string().trim().min(1)
    })
  ]),
  creationStatement: z.string().trim(),
  revocationStatement: z.string().trim()
});

export const awsMemoryDbEditInputsSchema = awsMemoryDbCreateInputsSchema.partial();

export type TAwsElastiCacheCreateValues = TDynamicSecretProviderFormValues<
  z.infer<typeof awsElastiCacheCreateInputsSchema>
>;
export type TAwsElastiCacheEditValues = TDynamicSecretProviderFormValues<
  z.infer<typeof awsElastiCacheEditInputsSchema>
>;
export type TAwsMemoryDbCreateValues = TDynamicSecretProviderFormValues<
  z.infer<typeof awsMemoryDbCreateInputsSchema>
>;
export type TAwsMemoryDbEditValues = TDynamicSecretProviderFormValues<
  z.infer<typeof awsMemoryDbEditInputsSchema>
>;

export const awsElastiCacheCreateFormSchema = createDynamicSecretProviderFormSchema(
  awsElastiCacheCreateInputsSchema
) as z.ZodType<TAwsElastiCacheCreateValues>;
export const awsElastiCacheEditFormSchema = editDynamicSecretProviderFormSchema(
  awsElastiCacheEditInputsSchema,
  { usernameTemplateSchema: z.string().trim().nullable().optional() }
) as z.ZodType<TAwsElastiCacheEditValues>;
export const awsMemoryDbCreateFormSchema = createDynamicSecretProviderFormSchema(
  awsMemoryDbCreateInputsSchema
) as z.ZodType<TAwsMemoryDbCreateValues>;
export const awsMemoryDbEditFormSchema = editDynamicSecretProviderFormSchema(
  awsMemoryDbEditInputsSchema,
  { usernameTemplateSchema: z.string().trim().nullable().optional() }
) as z.ZodType<TAwsMemoryDbEditValues>;

const getCreateDefaults = (context: TCreateDynamicSecretProviderFormContext) => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE
});

export const getAwsElastiCacheCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TAwsElastiCacheCreateValues => ({
  ...getCreateDefaults(context),
  inputs: {
    clusterName: "",
    accessKeyId: "",
    secretAccessKey: "",
    region: "",
    creationStatement: ELASTICACHE_CREATION_STATEMENT,
    revocationStatement: ELASTICACHE_REVOCATION_STATEMENT
  }
});

export const getAwsMemoryDbCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TAwsMemoryDbCreateValues => ({
  ...getCreateDefaults(context),
  inputs: {
    clusterName: "",
    region: "",
    auth: {
      type: AwsMemoryDbAuthType.IAM,
      accessKeyId: "",
      secretAccessKey: ""
    },
    creationStatement: MEMORYDB_CREATION_STATEMENT,
    revocationStatement: MEMORYDB_REVOCATION_STATEMENT
  }
});

const getEditDefaults = (context: TEditDynamicSecretProviderFormContext) => ({
  name: context.dynamicSecret.name,
  defaultTTL: context.dynamicSecret.defaultTTL,
  maxTTL: context.dynamicSecret.maxTTL,
  usernameTemplate:
    context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE
});

export const getAwsElastiCacheEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TAwsElastiCacheEditValues => ({
  ...getEditDefaults(context),
  inputs: { ...(context.dynamicSecret.inputs as TAwsElastiCacheEditValues["inputs"]) }
});

export const getAwsMemoryDbEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TAwsMemoryDbEditValues => ({
  ...getEditDefaults(context),
  inputs: { ...(context.dynamicSecret.inputs as TAwsMemoryDbEditValues["inputs"]) }
});

const getCreatePayloadBase = (
  values: TDynamicSecretProviderFormValues,
  context: TCreateDynamicSecretProviderFormContext
) => ({
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? "",
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
});

export const getAwsElastiCacheCreatePayload = (
  values: TAwsElastiCacheCreateValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.AwsElastiCache> => ({
  ...getCreatePayloadBase(values, context),
  provider: {
    type: DynamicSecretProviders.AwsElastiCache,
    inputs: awsElastiCacheCreateInputsSchema.parse(values.inputs)
  }
});

export const getAwsMemoryDbCreatePayload = (
  values: TAwsMemoryDbCreateValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.AwsMemoryDb> => ({
  ...getCreatePayloadBase(values, context),
  provider: {
    type: DynamicSecretProviders.AwsMemoryDb,
    inputs: awsMemoryDbCreateInputsSchema.parse(values.inputs)
  }
});

const getEditPayload = (
  values: TDynamicSecretProviderFormValues,
  context: TEditDynamicSecretProviderFormContext,
  inputs: unknown
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || undefined,
    defaultTTL: values.defaultTTL,
    inputs,
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
  }
});

export const getAwsElastiCacheEditPayload = (
  values: TAwsElastiCacheEditValues,
  context: TEditDynamicSecretProviderFormContext
) => getEditPayload(values, context, awsElastiCacheEditInputsSchema.parse(values.inputs));

export const getAwsMemoryDbEditPayload = (
  values: TAwsMemoryDbEditValues,
  context: TEditDynamicSecretProviderFormContext
) => getEditPayload(values, context, awsMemoryDbEditInputsSchema.parse(values.inputs));
