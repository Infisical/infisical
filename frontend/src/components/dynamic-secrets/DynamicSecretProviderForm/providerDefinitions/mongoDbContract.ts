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
import type {
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderFormValues,
  TEditDynamicSecretProviderFormContext
} from "../types";

const roleSchema = z.object({ roleName: z.string().min(1) });
export const mongoDbCreateInputsSchema = z.object({
  host: z.string().toLowerCase().min(1),
  port: z.coerce.number().optional(),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  ca: z.string().optional(),
  sslRejectUnauthorized: z.boolean().default(true),
  roles: roleSchema.array().min(1)
});
export const mongoDbEditInputsSchema = mongoDbCreateInputsSchema.partial();
export type TMongoDbCreateValues = TDynamicSecretProviderFormValues<
  z.infer<typeof mongoDbCreateInputsSchema>
>;
export type TMongoDbEditValues = TDynamicSecretProviderFormValues<
  z.infer<typeof mongoDbEditInputsSchema>
>;
export const mongoDbCreateFormSchema = createDynamicSecretProviderFormSchema(
  mongoDbCreateInputsSchema
) as z.ZodType<TMongoDbCreateValues>;
export const mongoDbEditFormSchema = editDynamicSecretProviderFormSchema(mongoDbEditInputsSchema, {
  usernameTemplateSchema: z.string().trim().nullable().optional()
}) as z.ZodType<TMongoDbEditValues>;
export const getMongoDbCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TMongoDbCreateValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    host: "",
    port: 27017,
    database: "",
    username: "",
    password: "",
    ca: undefined,
    sslRejectUnauthorized: true,
    roles: [{ roleName: "readWrite" }]
  }
});
export const getMongoDbEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TMongoDbEditValues => {
  const inputs = context.dynamicSecret.inputs as { roles?: string[] } & Record<string, unknown>;
  return {
    name: context.dynamicSecret.name,
    defaultTTL: context.dynamicSecret.defaultTTL,
    maxTTL: context.dynamicSecret.maxTTL,
    usernameTemplate:
      context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
    inputs: {
      ...inputs,
      roles: inputs.roles?.map((roleName) => ({ roleName }))
    } as TMongoDbEditValues["inputs"]
  };
};
export const getMongoDbCreatePayload = (
  values: TMongoDbCreateValues,
  context: TCreateDynamicSecretProviderFormContext
) => ({
  provider: {
    type: DynamicSecretProviders.MongoDB as const,
    inputs: {
      ...mongoDbCreateInputsSchema.parse(values.inputs),
      port: values.inputs.port || undefined,
      roles: values.inputs.roles.map(({ roleName }) => roleName)
    }
  },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? "",
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
});
export const getMongoDbEditPayload = (
  values: TMongoDbEditValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => {
  const inputs = mongoDbEditInputsSchema.parse(values.inputs);
  return {
    name: context.dynamicSecret.name,
    path: context.secretPath,
    projectSlug: context.projectSlug,
    environmentSlug: context.environment,
    data: {
      maxTTL: values.maxTTL || undefined,
      defaultTTL: values.defaultTTL,
      inputs: { ...inputs, roles: inputs.roles?.map(({ roleName }) => roleName) },
      newName: values.name === context.dynamicSecret.name ? undefined : values.name,
      usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
    }
  };
};
