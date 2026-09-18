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

export const SNOWFLAKE_CUSTOM_RENDERER_REASONS = ["non-scalar-value"] as const;

export const SNOWFLAKE_CREATION_STATEMENT =
  "CREATE USER {{username}} PASSWORD = '{{password}}' DEFAULT_ROLE = public DEFAULT_SECONDARY_ROLES = ('ALL') MUST_CHANGE_PASSWORD = FALSE DAYS_TO_EXPIRY = {{expiration}};";
export const SNOWFLAKE_REVOCATION_STATEMENT = "DROP USER {{username}};";
export const SNOWFLAKE_RENEW_STATEMENT =
  "ALTER USER {{username}} SET DAYS_TO_EXPIRY = {{expiration}};";

export const snowflakeCreateInputsSchema = z.object({
  accountId: z.string().trim().min(1),
  orgId: z.string().trim().min(1),
  username: z.string().trim().min(1),
  password: z.string().trim().min(1),
  creationStatement: z.string().trim().min(1),
  revocationStatement: z.string().trim().min(1),
  renewStatement: z.string().trim().optional()
});

export const snowflakeEditInputsSchema = snowflakeCreateInputsSchema.partial();

export type TSnowflakeCreateInputs = z.infer<typeof snowflakeCreateInputsSchema>;
export type TSnowflakeEditInputs = z.infer<typeof snowflakeEditInputsSchema>;
export type TSnowflakeCreateFormValues = TDynamicSecretProviderFormValues<TSnowflakeCreateInputs>;
export type TSnowflakeEditFormValues = TDynamicSecretProviderFormValues<TSnowflakeEditInputs>;

export const snowflakeCreateFormSchema = createDynamicSecretProviderFormSchema(
  snowflakeCreateInputsSchema
) as z.ZodType<TSnowflakeCreateFormValues>;
export const snowflakeEditFormSchema = editDynamicSecretProviderFormSchema(
  snowflakeEditInputsSchema,
  { usernameTemplateSchema: z.string().trim().nullable().optional() }
) as z.ZodType<TSnowflakeEditFormValues>;

export const getSnowflakeCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TSnowflakeCreateFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    accountId: "",
    orgId: "",
    username: "",
    password: "",
    creationStatement: SNOWFLAKE_CREATION_STATEMENT,
    revocationStatement: SNOWFLAKE_REVOCATION_STATEMENT,
    renewStatement: SNOWFLAKE_RENEW_STATEMENT
  }
});

export const getSnowflakeEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TSnowflakeEditFormValues => ({
  name: context.dynamicSecret.name,
  defaultTTL: context.dynamicSecret.defaultTTL,
  maxTTL: context.dynamicSecret.maxTTL,
  usernameTemplate:
    context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: { ...(context.dynamicSecret.inputs as TSnowflakeEditInputs) }
});

export const getSnowflakeCreatePayload = (
  values: TSnowflakeCreateFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.Snowflake> => ({
  provider: {
    type: DynamicSecretProviders.Snowflake,
    inputs: snowflakeCreateInputsSchema.parse(values.inputs)
  },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? "",
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
});

export const getSnowflakeEditPayload = (
  values: TSnowflakeEditFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || undefined,
    defaultTTL: values.defaultTTL,
    inputs: snowflakeEditInputsSchema.parse(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
  }
});
