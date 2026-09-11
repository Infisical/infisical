import { IdentityKubernetesAuthTokenReviewMode } from "../identities/types";

export enum MachineIdentityAuthMethod {
  LDAP = "ldap",
  KUBERNETES = "kubernetes",
  OIDC = "oidc"
}

export interface LdapTemplateFields {
  url: string;
  bindDN: string;
  bindPass: string;
  searchBase: string;
  ldapCaCertificate?: string;
  // presence flag returned in place of the write-only secret
  hasBindPass?: boolean;
}

export interface KubernetesTemplateFields {
  tokenReviewMode: IdentityKubernetesAuthTokenReviewMode;
  kubernetesHost?: string | null;
  caCert?: string;
  verifyTlsCertificate?: boolean;
  tokenReviewerJwt?: string;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  allowedAudience?: string;
  // presence flag returned in place of the write-only secret
  hasTokenReviewerJwt?: boolean;
}

export interface OidcTemplateFields {
  oidcDiscoveryUrl: string;
  boundIssuer: string;
  boundAudiences?: string;
  caCert?: string;
}

export type TemplateFieldsByMethod = {
  [MachineIdentityAuthMethod.LDAP]: LdapTemplateFields;
  [MachineIdentityAuthMethod.KUBERNETES]: KubernetesTemplateFields;
  [MachineIdentityAuthMethod.OIDC]: OidcTemplateFields;
};

export interface IdentityAuthTemplateForMethod<
  T extends MachineIdentityAuthMethod = MachineIdentityAuthMethod
> {
  id: string;
  name: string;
  authMethod: T;
  organizationId: string;
  templateFields: TemplateFieldsByMethod[T];
  createdAt: string;
  updatedAt: string;
}

export type IdentityAuthTemplate =
  | IdentityAuthTemplateForMethod<MachineIdentityAuthMethod.LDAP>
  | IdentityAuthTemplateForMethod<MachineIdentityAuthMethod.KUBERNETES>
  | IdentityAuthTemplateForMethod<MachineIdentityAuthMethod.OIDC>;

export interface CreateIdentityAuthTemplateDTO {
  organizationId: string;
  name: string;
  authMethod: MachineIdentityAuthMethod;
  templateFields: LdapTemplateFields | KubernetesTemplateFields | OidcTemplateFields;
}

export interface UpdateIdentityAuthTemplateDTO {
  templateId: string;
  organizationId: string;
  name?: string;
  templateFields?:
    | Partial<LdapTemplateFields>
    | Partial<KubernetesTemplateFields>
    | Partial<OidcTemplateFields>;
}

export interface DeleteIdentityAuthTemplateDTO {
  templateId: string;
  organizationId: string;
}

export interface GetIdentityAuthTemplatesDTO {
  organizationId: string;
  limit?: number;
  offset?: number;
  search?: string;
  isDisabled?: boolean;
}

export interface MachineAuthTemplateUsage {
  identityId: string;
  identityName: string;
}

export interface GetTemplateUsagesDTO {
  templateId: string;
  organizationId: string;
}

export interface UnlinkTemplateUsageDTO {
  templateId: string;
  identityIds: string[];
  organizationId: string;
}

export const TEMPLATE_ERROR_MESSAGES = {
  UNLINK_SUCCESS: "Successfully unlinked template usages",
  UNLINK_FAILED: "Failed to unlink template usages",
  SINGLE_UNLINK_SUCCESS: "Successfully unlinked template usage",
  SINGLE_UNLINK_FAILED: "Failed to unlink template usage"
} as const;

export const TEMPLATE_UI_LABELS = {
  VIEW_USAGES: "View Usages",
  EDIT_TEMPLATE: "Edit Template",
  DELETE_TEMPLATE: "Delete Template",
  UNLINK: "Unlink",
  UNSELECT_ALL: "Unselect All"
} as const;
