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

export const SAP_HANA_CREATION_STATEMENT = `CREATE USER {{username}} PASSWORD {{password}} NO FORCE_FIRST_PASSWORD_CHANGE VALID UNTIL '{{expiration}}';
GRANT "MONITORING" TO {{username}};`;
export const SAP_HANA_REVOCATION_STATEMENT = `REVOKE "MONITORING" FROM {{username}};
DROP USER {{username}};`;
export const SAP_HANA_RENEW_STATEMENT = "ALTER USER {{username}} VALID UNTIL '{{expiration}}';";

export const sapHanaCreateInputsSchema = z.object({
  host: z.string().toLowerCase().min(1),
  port: z.coerce.number(),
  username: z.string().min(1),
  password: z.string().min(1),
  creationStatement: z.string().min(1),
  revocationStatement: z.string().min(1),
  renewStatement: z.string().optional(),
  ca: z.string().optional(),
  sslRejectUnauthorized: z.boolean().default(true)
});

export const sapHanaEditInputsSchema = sapHanaCreateInputsSchema.partial();

export type TSapHanaCreateInputs = z.infer<typeof sapHanaCreateInputsSchema>;
export type TSapHanaEditInputs = z.infer<typeof sapHanaEditInputsSchema>;
export type TSapHanaCreateFormValues = TDynamicSecretProviderFormValues<TSapHanaCreateInputs>;
export type TSapHanaEditFormValues = TDynamicSecretProviderFormValues<TSapHanaEditInputs>;

export const sapHanaCreateFormSchema = createDynamicSecretProviderFormSchema(
  sapHanaCreateInputsSchema
) as z.ZodType<TSapHanaCreateFormValues>;
export const sapHanaEditFormSchema = editDynamicSecretProviderFormSchema(sapHanaEditInputsSchema, {
  usernameTemplateSchema: z.string().trim().nullable().optional()
}) as z.ZodType<TSapHanaEditFormValues>;

export const getSapHanaCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TSapHanaCreateFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    host: "",
    port: 443,
    username: "",
    password: "",
    creationStatement: SAP_HANA_CREATION_STATEMENT,
    revocationStatement: SAP_HANA_REVOCATION_STATEMENT,
    renewStatement: SAP_HANA_RENEW_STATEMENT,
    ca: undefined,
    sslRejectUnauthorized: true
  }
});

export const getSapHanaEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TSapHanaEditFormValues => ({
  name: context.dynamicSecret.name,
  defaultTTL: context.dynamicSecret.defaultTTL,
  maxTTL: context.dynamicSecret.maxTTL,
  usernameTemplate:
    context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: { ...(context.dynamicSecret.inputs as TSapHanaEditInputs) }
});

export const getSapHanaCreatePayload = (
  values: TSapHanaCreateFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.SapHana> => ({
  provider: {
    type: DynamicSecretProviders.SapHana,
    inputs: sapHanaCreateInputsSchema.parse(values.inputs)
  },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate),
  environmentSlug: values.environment?.slug ?? ""
});

export const getSapHanaEditPayload = (
  values: TSapHanaEditFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || undefined,
    defaultTTL: values.defaultTTL,
    inputs: sapHanaEditInputsSchema.parse(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
  }
});
