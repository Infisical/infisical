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

export const SAP_ASE_CUSTOM_RENDERER_REASONS = ["non-scalar-value"] as const;

export const SAP_ASE_CREATION_STATEMENT = `sp_addlogin '{{username}}', '{{password}}';
sp_adduser '{{username}}', '{{username}}', null;
sp_role 'grant', 'mon_role', '{{username}}';`;
export const SAP_ASE_REVOCATION_STATEMENT = `sp_dropuser '{{username}}';
sp_droplogin '{{username}}';`;

export const sapAseCreateInputsSchema = z.object({
  host: z.string().toLowerCase().min(1),
  port: z.number(),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  creationStatement: z.string().min(1),
  revocationStatement: z.string().min(1)
});

export const sapAseEditInputsSchema = sapAseCreateInputsSchema.partial();

export type TSapAseCreateInputs = z.infer<typeof sapAseCreateInputsSchema>;
export type TSapAseEditInputs = z.infer<typeof sapAseEditInputsSchema>;
export type TSapAseCreateFormValues = TDynamicSecretProviderFormValues<TSapAseCreateInputs>;
export type TSapAseEditFormValues = TDynamicSecretProviderFormValues<TSapAseEditInputs>;

export const sapAseCreateFormSchema = createDynamicSecretProviderFormSchema(
  sapAseCreateInputsSchema
) as z.ZodType<TSapAseCreateFormValues>;
export const sapAseEditFormSchema = editDynamicSecretProviderFormSchema(sapAseEditInputsSchema, {
  usernameTemplateSchema: z.string().trim().nullable().optional()
}) as z.ZodType<TSapAseEditFormValues>;

export const getSapAseCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TSapAseCreateFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    host: "",
    port: 5000,
    database: "master",
    username: "",
    password: "",
    creationStatement: SAP_ASE_CREATION_STATEMENT,
    revocationStatement: SAP_ASE_REVOCATION_STATEMENT
  }
});

export const getSapAseEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TSapAseEditFormValues => ({
  name: context.dynamicSecret.name,
  defaultTTL: context.dynamicSecret.defaultTTL,
  maxTTL: context.dynamicSecret.maxTTL,
  usernameTemplate:
    context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: sapAseEditInputsSchema.parse(context.dynamicSecret.inputs)
});

export const getSapAseCreatePayload = (
  values: TSapAseCreateFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.SapAse> => ({
  provider: {
    type: DynamicSecretProviders.SapAse,
    inputs: sapAseCreateInputsSchema.parse(values.inputs)
  },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? "",
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
});

export const getSapAseEditPayload = (
  values: TSapAseEditFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || undefined,
    defaultTTL: values.defaultTTL,
    inputs: sapAseEditInputsSchema.parse(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
  }
});
