import { TProjectPermission } from "@app/lib/types";

import { IdentityAuthTemplateMethod } from "./identity-auth-template-enums";

// Method-specific template field types
export type TLdapTemplateFields = {
  url: string;
  bindDN: string;
  bindPass: string;
  searchBase: string;
  ldapCaCertificate?: string;
};

// Union type for all template field types
export type TTemplateFieldsByMethod = {
  [IdentityAuthTemplateMethod.LDAP]: TLdapTemplateFields;
};

// Generic base types that use conditional types for type safety
export type TCreateIdentityAuthTemplateDTO = {
  name: string;
  authMethod: IdentityAuthTemplateMethod;
  templateFields: TTemplateFieldsByMethod[IdentityAuthTemplateMethod];
} & Omit<TProjectPermission, "projectId">;

export type TUpdateIdentityAuthTemplateDTO = {
  templateId: string;
  name?: string;
  templateFields?: Partial<TTemplateFieldsByMethod[IdentityAuthTemplateMethod]>;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteIdentityAuthTemplateDTO = {
  templateId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetIdentityAuthTemplateDTO = {
  templateId: string;
} & Omit<TProjectPermission, "projectId">;

export type TListIdentityAuthTemplatesDTO = {
  limit?: number;
  offset?: number;
  search?: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetTemplatesByAuthMethodDTO = {
  authMethod: string;
} & Omit<TProjectPermission, "projectId">;

export type TFindTemplateUsagesDTO = {
  templateId: string;
} & Omit<TProjectPermission, "projectId">;

export type TUnlinkTemplateUsageDTO = {
  templateId: string;
  identityIds: string[];
} & Omit<TProjectPermission, "projectId">;

// Specific LDAP types for convenience
export type TCreateLdapTemplateDTO = TCreateIdentityAuthTemplateDTO;
export type TUpdateLdapTemplateDTO = TUpdateIdentityAuthTemplateDTO;
