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

export const CLICKHOUSE_CUSTOM_RENDERER_REASONS = [
  "permission-aware-fields",
  "repeatable-fields",
  "non-scalar-value"
] as const;

export const clickHousePasswordRequirementsSchema = z
  .object({
    length: z.number().min(1).max(250),
    required: z
      .object({
        lowercase: z.number().min(0),
        uppercase: z.number().min(0),
        digits: z.number().min(0),
        symbols: z.number().min(0)
      })
      .refine(
        (required) => Object.values(required).reduce((sum, count) => sum + count, 0) <= 250,
        "Sum of required characters cannot exceed 250"
      ),
    allowedSymbols: z.string().optional()
  })
  .refine(
    ({ length, required }) =>
      Object.values(required).reduce((sum, count) => sum + count, 0) <= length,
    "Sum of required characters cannot exceed the total length"
  );

export const clickHouseCreateInputsSchema = z.object({
  host: z.string().min(1),
  port: z.number(),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  passwordRequirements: clickHousePasswordRequirementsSchema.optional(),
  creationStatement: z.string().min(1),
  revocationStatement: z.string().min(1),
  renewStatement: z.string().optional(),
  ca: z.string().optional(),
  gatewayId: z.string().optional(),
  gatewayPoolId: z.string().optional()
});

export const clickHouseEditInputsSchema = clickHouseCreateInputsSchema
  .extend({
    port: z.number(),
    gatewayId: z.string().optional().nullable(),
    gatewayPoolId: z.string().optional().nullable()
  })
  .partial();

const metadataSchema = z
  .array(z.object({ key: z.string().trim().min(1), value: z.string().trim().default("") }))
  .optional();

export type TClickHouseFormValues = TDynamicSecretProviderFormValues<
  z.infer<typeof clickHouseCreateInputsSchema>
> & { metadata?: { key: string; value: string }[] };

export const clickHouseCreateFormSchema = createDynamicSecretProviderFormSchema(
  clickHouseCreateInputsSchema
).extend({ metadata: metadataSchema }) as z.ZodType<TClickHouseFormValues>;

export const clickHouseEditFormSchema = editDynamicSecretProviderFormSchema(
  clickHouseEditInputsSchema,
  { usernameTemplateSchema: z.string().trim().nullable().optional() }
).extend({ metadata: metadataSchema }) as z.ZodType<TClickHouseFormValues>;

export const getDefaultClickHousePasswordRequirements = () => ({
  length: 48,
  required: { lowercase: 1, uppercase: 1, digits: 1, symbols: 1 },
  allowedSymbols: "-_.~!*"
});

export const getClickHouseCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TClickHouseFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  metadata: undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    host: "",
    port: 8123,
    database: "default",
    username: "",
    password: "",
    creationStatement:
      "CREATE USER '{{username}}' IDENTIFIED WITH sha256_password BY '{{password}}';\nGRANT SELECT ON {{database}}.* TO '{{username}}';",
    revocationStatement: "DROP USER IF EXISTS '{{username}}';",
    renewStatement: "",
    ca: "",
    passwordRequirements: getDefaultClickHousePasswordRequirements()
  }
});

export const getClickHouseEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TClickHouseFormValues => {
  const inputs = context.dynamicSecret.inputs as TClickHouseFormValues["inputs"];
  return {
    name: context.dynamicSecret.name,
    defaultTTL: context.dynamicSecret.defaultTTL,
    maxTTL: context.dynamicSecret.maxTTL,
    metadata: context.dynamicSecret.metadata,
    usernameTemplate:
      context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
    inputs: {
      ...inputs,
      passwordRequirements:
        inputs.passwordRequirements || getDefaultClickHousePasswordRequirements()
    }
  };
};

export const getClickHouseCreatePayload = (
  values: TClickHouseFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.Clickhouse> => ({
  provider: {
    type: DynamicSecretProviders.Clickhouse,
    inputs: clickHouseCreateInputsSchema.parse(values.inputs)
  },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? "",
  metadata: values.metadata,
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
});

export const getClickHouseEditPayload = (
  values: TClickHouseFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => {
  const inputs = clickHouseEditInputsSchema.parse(values.inputs);
  return {
    name: context.dynamicSecret.name,
    path: context.secretPath,
    projectSlug: context.projectSlug,
    environmentSlug: context.environment,
    data: {
      maxTTL: values.maxTTL || undefined,
      defaultTTL: values.defaultTTL,
      inputs: {
        ...inputs,
        gatewayId: inputs.gatewayId ?? null,
        gatewayPoolId: inputs.gatewayPoolId ?? null
      },
      newName: values.name === context.dynamicSecret.name ? undefined : values.name,
      metadata: values.metadata,
      usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
    }
  };
};
