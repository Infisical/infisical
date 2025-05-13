import { IdentityAuthMethod } from "./enums";

export const identityAuthToNameMap: { [I in IdentityAuthMethod]: string } = {
  [IdentityAuthMethod.TOKEN_AUTH]: "Token Auth",
  [IdentityAuthMethod.UNIVERSAL_AUTH]: "Universal Auth",
  [IdentityAuthMethod.KUBERNETES_AUTH]: "Kubernetes Auth",
  [IdentityAuthMethod.GCP_AUTH]: "GCP Auth",
  [IdentityAuthMethod.AWS_AUTH]: "AWS Auth",
  [IdentityAuthMethod.AZURE_AUTH]: "Azure Auth",
  [IdentityAuthMethod.OIDC_AUTH]: "OIDC Auth",
  [IdentityAuthMethod.LDAP_AUTH]: "LDAP Auth",
  [IdentityAuthMethod.JWT_AUTH]: "JWT Auth"
};
