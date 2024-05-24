import { IdentityAuthMethod } from "./enums";

export const identityAuthToNameMap: { [I in IdentityAuthMethod]: string } = {
  [IdentityAuthMethod.UNIVERSAL_AUTH]: "Universal Auth",
  [IdentityAuthMethod.KUBERNETES_AUTH]: "Kubernetes Auth",
  [IdentityAuthMethod.GCP_AUTH]: "GCP Auth",
  [IdentityAuthMethod.AWS_AUTH]: "AWS Auth"
};
