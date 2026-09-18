import { IdentityAuthMethod } from "./enums";

// Sensible Universal Auth defaults used by in-product identity creation flows (Cert Manager, PAM)
export const UNIVERSAL_AUTH_DEFAULTS = {
  clientSecretTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }],
  accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }],
  accessTokenTTL: 2592000,
  accessTokenMaxTTL: 2592000,
  accessTokenNumUsesLimit: 0,
  accessTokenPeriod: 0,
  lockoutEnabled: true,
  lockoutThreshold: 3,
  lockoutDurationSeconds: 300,
  lockoutCounterResetSeconds: 30
};

export const identityAuthToNameMap: { [I in IdentityAuthMethod]: string } = {
  [IdentityAuthMethod.TOKEN_AUTH]: "Token Auth",
  [IdentityAuthMethod.UNIVERSAL_AUTH]: "Universal Auth",
  [IdentityAuthMethod.KUBERNETES_AUTH]: "Kubernetes Auth",
  [IdentityAuthMethod.GCP_AUTH]: "GCP Auth",
  [IdentityAuthMethod.ALICLOUD_AUTH]: "Alibaba Cloud Auth",
  [IdentityAuthMethod.AWS_AUTH]: "AWS Auth",
  [IdentityAuthMethod.AZURE_AUTH]: "Azure Auth",
  [IdentityAuthMethod.OCI_AUTH]: "OCI Auth",
  [IdentityAuthMethod.OIDC_AUTH]: "OIDC Auth",
  [IdentityAuthMethod.LDAP_AUTH]: "LDAP Auth",
  [IdentityAuthMethod.JWT_AUTH]: "JWT Auth",
  [IdentityAuthMethod.TLS_CERT_AUTH]: "TLS Certificate Auth",
  [IdentityAuthMethod.SPIFFE_AUTH]: "SPIFFE Auth"
};
