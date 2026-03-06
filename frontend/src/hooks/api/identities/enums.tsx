export enum IdentityAuthMethod {
  TOKEN_AUTH = "token-auth",
  UNIVERSAL_AUTH = "universal-auth",
  KUBERNETES_AUTH = "kubernetes-auth",
  GCP_AUTH = "gcp-auth",
  ALICLOUD_AUTH = "alicloud-auth",
  AWS_AUTH = "aws-auth",
  AZURE_AUTH = "azure-auth",
  OCI_AUTH = "oci-auth",
  OIDC_AUTH = "oidc-auth",
  LDAP_AUTH = "ldap-auth",
  JWT_AUTH = "jwt-auth",
  TLS_CERT_AUTH = "tls-cert-auth",
  SPIFFE_AUTH = "spiffe-auth"
}

export enum IdentityJwtConfigurationType {
  JWKS = "jwks",
  STATIC = "static"
}

export enum IdentitySpiffeConfigurationType {
  STATIC = "static",
  REMOTE = "remote"
}

export enum SpiffeBundleEndpointProfile {
  HTTPS_WEB = "https_web",
  HTTPS_SPIFFE = "https_spiffe"
}
