import { IdentityAuthMethod } from "./enums";

export const identityAuthToNameMap: { [I in IdentityAuthMethod]: string } = {
  [IdentityAuthMethod.UNIVERSAL_AUTH]: "Universal Auth",
  [IdentityAuthMethod.GCP_IAM_AUTH]: "GCP IAM Auth"
};
