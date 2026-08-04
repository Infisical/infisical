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

export enum LdapCredentialType {
  Dynamic = "dynamic",
  Static = "static"
}
const shared = {
  url: z.string().trim().min(1),
  binddn: z.string().trim().min(1),
  bindpass: z.string().trim().min(1),
  ca: z.string().optional(),
  sslRejectUnauthorized: z.boolean().default(true)
};
const inputsSchema = z.discriminatedUnion("credentialType", [
  z.object({
    ...shared,
    credentialType: z.literal(LdapCredentialType.Dynamic),
    creationLdif: z.string().min(1),
    revocationLdif: z.string().min(1),
    rollbackLdif: z.string().optional()
  }),
  z.object({
    ...shared,
    credentialType: z.literal(LdapCredentialType.Static),
    rotationLdif: z.string().min(1)
  })
]);
export type TLdapFormValues = TDynamicSecretProviderFormValues<z.infer<typeof inputsSchema>>;
export const ldapCreateFormSchema = createDynamicSecretProviderFormSchema(
  inputsSchema
) as z.ZodType<TLdapFormValues>;
export const ldapEditFormSchema = editDynamicSecretProviderFormSchema(inputsSchema, {
  usernameTemplateSchema: z.string().trim().nullable().optional()
}) as z.ZodType<TLdapFormValues>;
export const getLdapCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TLdapFormValues => ({
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
): TLdapFormValues => ({
  name: context.dynamicSecret.name,
  defaultTTL: context.dynamicSecret.defaultTTL,
  maxTTL: context.dynamicSecret.maxTTL,
  usernameTemplate:
    context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: context.dynamicSecret.inputs as TLdapFormValues["inputs"]
});
export const getLdapVaultImportValues = (role: VaultLdapRole): Partial<TLdapFormValues> => ({
  name: role.name,
  defaultTTL: role.default_ttl ? `${role.default_ttl}s` : undefined,
  maxTTL: role.max_ttl ? `${role.max_ttl}s` : undefined,
  usernameTemplate: role.username_template,
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
  values: TLdapFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.Ldap> => ({
  provider: { type: DynamicSecretProviders.Ldap, inputs: inputsSchema.parse(values.inputs) },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate),
  environmentSlug: values.environment?.slug ?? ""
});
export const getLdapEditPayload = (
  values: TLdapFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || undefined,
    defaultTTL: values.defaultTTL,
    inputs: inputsSchema.parse(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
  }
});
