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

export const AZURE_SQL_DATABASE_CUSTOM_RENDERER_REASONS = [
  "conditional-fields",
  "repeatable-fields",
  "permission-aware-fields",
  "non-scalar-value"
] as const;

export const azureSqlPasswordRequirementsSchema = z
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
        (value) => Object.values(value).reduce((sum, count) => sum + count, 0) <= 250,
        "Sum of required characters cannot exceed 250"
      ),
    allowedSymbols: z.string().optional()
  })
  .refine(
    (value) => Object.values(value.required).reduce((sum, count) => sum + count, 0) <= value.length,
    "Sum of required characters cannot exceed the total length"
  );

const createInputsSchema = z.object({
  host: z.string().toLowerCase().min(1),
  port: z.number(),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  passwordRequirements: azureSqlPasswordRequirementsSchema.optional(),
  masterCreationStatement: z.string().min(1),
  creationStatement: z.string().min(1),
  revocationStatement: z.string().min(1),
  renewStatement: z.string().optional(),
  sslEnabled: z.boolean().optional(),
  ca: z.string().optional(),
  sslRejectUnauthorized: z.boolean().default(true),
  gatewayId: z.string().optional(),
  gatewayPoolId: z.string().optional()
});
const editInputsSchema = z
  .object({
    host: z.string().toLowerCase().min(1),
    port: z.number(),
    database: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
    passwordRequirements: azureSqlPasswordRequirementsSchema.optional(),
    masterCreationStatement: z.string().min(1),
    creationStatement: z.string().min(1),
    revocationStatement: z.string().min(1),
    renewStatement: z.string().optional(),
    ca: z.string().optional(),
    sslEnabled: z.boolean().optional(),
    sslRejectUnauthorized: z.boolean().optional(),
    gatewayId: z.string().optional().nullable(),
    gatewayPoolId: z.string().optional().nullable()
  })
  .partial();
const metadataSchema = z
  .object({ key: z.string().trim().min(1), value: z.string().trim().default("") })
  .array()
  .optional();

export type TAzureSqlCreateValues = TDynamicSecretProviderFormValues<
  z.infer<typeof createInputsSchema>
> & { metadata?: z.infer<typeof metadataSchema> };
export type TAzureSqlEditValues = TDynamicSecretProviderFormValues<
  z.infer<typeof editInputsSchema>
> & { metadata?: z.infer<typeof metadataSchema> };

export const azureSqlCreateFormSchema = createDynamicSecretProviderFormSchema(
  createInputsSchema
).extend({ metadata: metadataSchema }) as z.ZodType<TAzureSqlCreateValues>;
export const azureSqlEditFormSchema = editDynamicSecretProviderFormSchema(editInputsSchema, {
  usernameTemplateSchema: z.string().nullable().optional()
}).extend({ metadata: metadataSchema }) as z.ZodType<TAzureSqlEditValues>;

export const DEFAULT_AZURE_SQL_PASSWORD_REQUIREMENTS = {
  length: 48,
  required: { lowercase: 1, uppercase: 1, digits: 1, symbols: 0 },
  allowedSymbols: "-_.~!*"
};
export const DEFAULT_AZURE_SQL_STATEMENTS = {
  masterCreationStatement: "CREATE LOGIN [{{username}}] WITH PASSWORD = '{{password}}';",
  creationStatement:
    "CREATE USER [{{username}}] FOR LOGIN [{{username}}];\nGRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO [{{username}}];",
  renewStatement: "",
  revocationStatement: "DROP USER [{{username}}];\nDROP LOGIN [{{username}}];"
};

export const getAzureSqlCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TAzureSqlCreateValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  metadata: [],
  inputs: {
    host: "",
    port: 1433,
    database: "",
    username: "",
    password: "",
    ...DEFAULT_AZURE_SQL_STATEMENTS,
    sslRejectUnauthorized: true,
    passwordRequirements: DEFAULT_AZURE_SQL_PASSWORD_REQUIREMENTS
  }
});
export const getAzureSqlEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TAzureSqlEditValues => {
  const inputs = context.dynamicSecret.inputs as TAzureSqlEditValues["inputs"];
  return {
    name: context.dynamicSecret.name,
    defaultTTL: context.dynamicSecret.defaultTTL,
    maxTTL: context.dynamicSecret.maxTTL || "",
    usernameTemplate:
      context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
    metadata: context.dynamicSecret.metadata?.map(({ key, value }) => ({ key, value })) ?? [],
    inputs: {
      ...inputs,
      passwordRequirements: inputs.passwordRequirements || DEFAULT_AZURE_SQL_PASSWORD_REQUIREMENTS
    }
  };
};

export const normalizeAzureSqlGatewayValueForMode = (
  mode: "create" | "edit",
  value: string | null
) => (mode === "create" ? value || undefined : value);

export const getAzureSqlCreatePayload = (
  values: TAzureSqlCreateValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.AzureSqlDatabase> => ({
  provider: {
    type: DynamicSecretProviders.AzureSqlDatabase,
    inputs: { ...createInputsSchema.parse(values.inputs), masterDatabase: "master" }
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
export const getAzureSqlEditPayload = (
  values: TAzureSqlEditValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || undefined,
    defaultTTL: values.defaultTTL,
    inputs: values.inputs
      ? { ...editInputsSchema.parse(values.inputs), masterDatabase: "master" }
      : undefined,
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    metadata: values.metadata,
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
  }
});
