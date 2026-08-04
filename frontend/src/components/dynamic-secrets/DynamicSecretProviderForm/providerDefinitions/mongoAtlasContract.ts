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

const mongoAtlasRoleSchema = z.object({
  collectionName: z.string().optional(),
  databaseName: z.string().min(1),
  roleName: z.string().min(1)
});

const mongoAtlasScopeSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1)
});

export const mongoAtlasCreateInputsSchema = z.object({
  adminPublicKey: z.string().trim().min(1),
  adminPrivateKey: z.string().trim().min(1),
  groupId: z.string().trim().min(1),
  roles: mongoAtlasRoleSchema.array().min(1),
  scopes: mongoAtlasScopeSchema.array()
});

export const mongoAtlasEditInputsSchema = mongoAtlasCreateInputsSchema.partial();

type TMongoAtlasRole = z.infer<typeof mongoAtlasRoleSchema>;
type TMongoAtlasScope = z.infer<typeof mongoAtlasScopeSchema>;

export type TMongoAtlasFormInputs = {
  adminPublicKey?: string;
  adminPrivateKey?: string;
  groupId?: string;
  roles?: TMongoAtlasRole[];
  scopes?: TMongoAtlasScope[];
};

export type TMongoAtlasFormValues = TDynamicSecretProviderFormValues<TMongoAtlasFormInputs>;

export const mongoAtlasCreateFormSchema = createDynamicSecretProviderFormSchema(
  mongoAtlasCreateInputsSchema
) as z.ZodType<TMongoAtlasFormValues>;

export const mongoAtlasEditFormSchema = editDynamicSecretProviderFormSchema(
  mongoAtlasEditInputsSchema,
  { usernameTemplateSchema: z.string().trim().nullable().optional() }
) as z.ZodType<TMongoAtlasFormValues>;

export const getMongoAtlasCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TMongoAtlasFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    adminPublicKey: "",
    adminPrivateKey: "",
    groupId: "",
    roles: [{ databaseName: "", roleName: "" }],
    scopes: []
  }
});

export const getMongoAtlasEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TMongoAtlasFormValues => {
  return {
    name: context.dynamicSecret.name,
    defaultTTL: context.dynamicSecret.defaultTTL,
    maxTTL: context.dynamicSecret.maxTTL,
    usernameTemplate:
      context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
    inputs: { ...(context.dynamicSecret.inputs as TMongoAtlasFormInputs) }
  };
};

export const getMongoAtlasCreatePayload = (
  values: TMongoAtlasFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.MongoAtlas> => ({
  provider: {
    type: DynamicSecretProviders.MongoAtlas,
    inputs: mongoAtlasCreateInputsSchema.parse(values.inputs)
  },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? "",
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
});

export const getMongoAtlasEditPayload = (
  values: TMongoAtlasFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || undefined,
    defaultTTL: values.defaultTTL,
    inputs: mongoAtlasEditInputsSchema.parse(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
  }
});
