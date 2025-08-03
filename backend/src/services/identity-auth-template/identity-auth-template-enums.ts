export enum IdentityAuthTemplateMethod {
  LDAP = "ldap"
}

export const TEMPLATE_VALIDATION_MESSAGES = {
  TEMPLATE_NAME_REQUIRED: "Template name is required",
  AUTH_METHOD_REQUIRED: "Auth method is required",
  TEMPLATE_ID_REQUIRED: "Template ID is required",
  LDAP_URL_REQUIRED: "LDAP URL is required",
  BIND_DN_REQUIRED: "Bind DN is required",
  BIND_PASSWORD_REQUIRED: "Bind password is required",
  SEARCH_BASE_REQUIRED: "Search base is required"
} as const;

export const TEMPLATE_SUCCESS_MESSAGES = {
  CREATED: "Template created successfully",
  UPDATED: "Template updated successfully",
  DELETED: "Template deleted successfully"
} as const;
