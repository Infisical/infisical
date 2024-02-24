import { AuthMethod } from "./auth-type";

export type TLoginGenServerPublicKeyDTO = {
  email: string;
  clientPublicKey: string;
  providerAuthToken?: string;
};

export type TLoginClientProofDTO = {
  email: string;
  clientProof: string;
  providerAuthToken?: string;
  ip: string;
  userAgent: string;
};

export type TVerifyMfaTokenDTO = {
  userId: string;
  mfaToken: string;
  ip: string;
  userAgent: string;
  orgId?: string;
};

export type TOauthLoginDTO = {
  email: string;
  firstName: string;
  lastName?: string;
  authMethod: AuthMethod;
  callbackPort?: string;
};
