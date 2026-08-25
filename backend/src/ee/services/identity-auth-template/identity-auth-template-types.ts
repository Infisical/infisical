import { z } from "zod";

import { TIdentityAuthTemplates } from "@app/db/schemas/identity-auth-templates";
import { TProjectPermission } from "@app/lib/types";
import { IdentityKubernetesAuthTokenReviewMode } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-types";

import { IdentityAuthTemplateMethod } from "./identity-auth-template-enums";
import {
  kubernetesTemplateFieldsResponseSchema,
  ldapTemplateFieldsResponseSchema
} from "./identity-auth-template-schemas";

// what every read path returns: the row with its credentials replaced by presence flags.
// Derived from the response schemas so the service and the route contract cannot drift
export type TSanitizedIdentityAuthTemplate = Omit<TIdentityAuthTemplates, "templateFields" | "authMethod"> &
  (
    | {
        authMethod: IdentityAuthTemplateMethod.LDAP;
        templateFields: z.infer<typeof ldapTemplateFieldsResponseSchema>;
      }
    | {
        authMethod: IdentityAuthTemplateMethod.KUBERNETES;
        templateFields: z.infer<typeof kubernetesTemplateFieldsResponseSchema>;
      }
  );

// Method-specific template field types
export type TLdapTemplateFields = {
  url: string;
  bindDN: string;
  bindPass: string;
  searchBase: string;
  ldapCaCertificate?: string;
};

export type TKubernetesTemplateFields = {
  tokenReviewMode: IdentityKubernetesAuthTokenReviewMode;
  kubernetesHost?: string | null;
  caCert?: string;
  verifyTlsCertificate?: boolean;
  tokenReviewerJwt?: string;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  allowedAudience?: string;
};

// Union type for all template field types
export type TTemplateFieldsByMethod = {
  [IdentityAuthTemplateMethod.LDAP]: TLdapTemplateFields;
  [IdentityAuthTemplateMethod.KUBERNETES]: TKubernetesTemplateFields;
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
