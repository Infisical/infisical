import { z } from "zod";

import {
  DynamicSecretProviders,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";
import type { VaultLdapRole } from "@app/hooks/api/migration/types";

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

export const LDAP_CUSTOM_RENDERER_REASONS = [
  "conditional-fields",
  "import-workflow",
  "remote-options"
] as const;

export enum LdapCredentialType {
  Dynamic = "dynamic",
  Static = "static"
}
const getSharedSchema = (sslRejectUnauthorized: z.ZodType<boolean | undefined>) => ({
  url: z.string().trim().min(1),
  binddn: z.string().trim().min(1),
  bindpass: z.string().trim().min(1),
  ca: z.string().optional(),
  sslRejectUnauthorized
});
const getInputsSchema = (sslRejectUnauthorized: z.ZodType<boolean | undefined>) =>
  z.discriminatedUnion("credentialType", [
    z.object({
      ...getSharedSchema(sslRejectUnauthorized),
      credentialType: z.literal(LdapCredentialType.Dynamic),
      creationLdif: z.string().min(1),
      revocationLdif: z.string().min(1),
      rollbackLdif: z.string().optional()
    }),
    z.object({
      ...getSharedSchema(sslRejectUnauthorized),
      credentialType: z.literal(LdapCredentialType.Static),
      rotationLdif: z.string().min(1)
    })
  ]);
const createInputsSchema = getInputsSchema(z.boolean().default(true));
const editInputsSchema = getInputsSchema(z.boolean().optional());

export type TLdapCreateFormValues = TDynamicSecretProviderFormValues<
  z.infer<typeof createInputsSchema>
>;
export type TLdapEditFormValues = TDynamicSecretProviderFormValues<
  z.infer<typeof editInputsSchema>
>;
export type TLdapFormValues = TLdapCreateFormValues & TLdapEditFormValues;
export const ldapCreateFormSchema = createDynamicSecretProviderFormSchema(
  createInputsSchema
) as z.ZodType<TLdapCreateFormValues>;
export const ldapEditFormSchema = editDynamicSecretProviderFormSchema(editInputsSchema, {
  usernameTemplateSchema: z.string().trim().nullable().optional()
}) as z.ZodType<TLdapEditFormValues>;
export const getLdapCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TLdapCreateFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    url: "",
    binddn: "",
    bindpass: "",
    ca: "",
    sslRejectUnauthorized: true,
    creationLdif: "",
    revocationLdif: "",
    rollbackLdif: "",
    credentialType: LdapCredentialType.Dynamic
  }
});
export const getLdapEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TLdapEditFormValues => ({
  name: context.dynamicSecret.name,
  defaultTTL: context.dynamicSecret.defaultTTL,
  maxTTL: context.dynamicSecret.maxTTL,
  usernameTemplate:
    context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: context.dynamicSecret.inputs as TLdapEditFormValues["inputs"]
});
export const getLdapVaultImportValues = (role: VaultLdapRole): Partial<TLdapCreateFormValues> => ({
  name: role.name,
  ...(role.default_ttl ? { defaultTTL: `${role.default_ttl}s` } : {}),
  ...(role.max_ttl ? { maxTTL: `${role.max_ttl}s` } : {}),
  ...(role.username_template ? { usernameTemplate: role.username_template } : {}),
  inputs: {
    url: role.config.url ?? "",
    binddn: role.config.binddn ?? "",
    bindpass: "",
    ca: role.config.certificate ?? "",
    sslRejectUnauthorized: true,
    credentialType: LdapCredentialType.Dynamic,
    creationLdif: role.creation_ldif ?? "",
    revocationLdif: role.deletion_ldif ?? "",
    rollbackLdif: role.rollback_ldif
  }
});
export const getLdapCreatePayload = (
  values: TLdapCreateFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.Ldap> => ({
  provider: { type: DynamicSecretProviders.Ldap, inputs: createInputsSchema.parse(values.inputs) },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate),
  environmentSlug: values.environment?.slug ?? ""
});
export const getLdapEditPayload = (
  values: TLdapEditFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || undefined,
    defaultTTL: values.defaultTTL,
    inputs: editInputsSchema.parse(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
  }
});
