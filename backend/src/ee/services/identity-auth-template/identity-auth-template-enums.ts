export enum IdentityAuthTemplateMethod {
  LDAP = "ldap",
  KUBERNETES = "kubernetes",
  OIDC = "oidc"
}

export const TEMPLATE_VALIDATION_MESSAGES = {
  TEMPLATE_NAME_REQUIRED: "Template name is required",
  TEMPLATE_NAME_MAX_LENGTH: "Template name must be at most 64 characters long",
  AUTH_METHOD_REQUIRED: "Auth method is required",
  TEMPLATE_ID_REQUIRED: "Template ID is required",
  LDAP: {
    URL_REQUIRED: "LDAP URL is required",
    BIND_DN_REQUIRED: "Bind DN is required",
    BIND_PASSWORD_REQUIRED: "Bind password is required",
    SEARCH_BASE_REQUIRED: "Search base is required"
  },
  KUBERNETES: {
    HOST_REQUIRED: "When token review mode is set to API, a Kubernetes host must be provided",
    GATEWAY_REQUIRED: "When token review mode is set to Gateway, a gateway or gateway pool must be selected",
    GATEWAY_CONFLICT: "Cannot specify both a gateway and a gateway pool",
    CA_CERT_REQUIRED:
      "A CA certificate is required when TLS certificate verification is enabled. Either paste the Kubernetes API server's CA certificate or disable verification.",
    TLS_VERIFICATION_CONFLICT:
      "TLS certificate verification cannot be disabled when a CA certificate is provided. Either remove the CA certificate or enable verification."
  },
  OIDC: {
    DISCOVERY_URL_REQUIRED: "OIDC discovery URL is required",
    DISCOVERY_URL_WELL_KNOWN_SUFFIX:
      "Remove the /.well-known/openid-configuration suffix from the OIDC discovery URL. Infisical appends it automatically.",
    ISSUER_REQUIRED: "Issuer is required"
  }
} as const;

export const TEMPLATE_SUCCESS_MESSAGES = {
  CREATED: "Template created successfully",
  UPDATED: "Template updated successfully",
  DELETED: "Template deleted successfully"
} as const;

// credentials stored inside templateFields that must never leave the backend; every
// template read path strips them, and the edit UI treats them as write-only
export const TEMPLATE_SECRET_FIELDS_BY_METHOD: Record<IdentityAuthTemplateMethod, readonly string[]> = {
  [IdentityAuthTemplateMethod.LDAP]: ["bindPass"],
  [IdentityAuthTemplateMethod.KUBERNETES]: ["tokenReviewerJwt"],
  [IdentityAuthTemplateMethod.OIDC]: []
};
