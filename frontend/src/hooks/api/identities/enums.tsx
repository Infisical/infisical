export enum IdentityAuthMethod {
  TOKEN_AUTH = "token-auth",
  UNIVERSAL_AUTH = "universal-auth",
  KUBERNETES_AUTH = "kubernetes-auth",
  GCP_AUTH = "gcp-auth",
  AWS_AUTH = "aws-auth",
  AZURE_AUTH = "azure-auth",
  OIDC_AUTH = "oidc-auth",
  LDAP_AUTH = "ldap-auth",
  JWT_AUTH = "jwt-auth"
}

export enum IdentityJwtConfigurationType {
  JWKS = "jwks",
  STATIC = "static"
}
