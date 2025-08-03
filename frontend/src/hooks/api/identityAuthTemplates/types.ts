export enum MachineIdentityAuthMethod {
  LDAP = "ldap"
}

export interface LdapTemplateFields {
  url: string;
  bindDN: string;
  bindPass: string;
  searchBase: string;
}

export interface IdentityAuthTemplate {
  id: string;
  name: string;
  authMethod: MachineIdentityAuthMethod;
  organizationId: string;
  templateFields: LdapTemplateFields;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIdentityAuthTemplateDTO {
  organizationId: string;
  name: string;
  authMethod: MachineIdentityAuthMethod;
  templateFields: LdapTemplateFields;
}

export interface UpdateIdentityAuthTemplateDTO {
  templateId: string;
  organizationId: string;
  name?: string;
  templateFields?: Partial<LdapTemplateFields>;
}

export interface DeleteIdentityAuthTemplateDTO {
  templateId: string;
  organizationId: string;
}

export interface GetIdentityAuthTemplatesDTO {
  organizationId: string;
  limit?: number;
  offset?: number;
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
