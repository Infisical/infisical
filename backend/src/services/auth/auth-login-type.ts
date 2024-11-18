import { AuthMethod, MfaMethod } from "./auth-type";

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
  captchaToken?: string;
  password?: string;
};

export type TVerifyMfaTokenDTO = {
  userId: string;
  mfaToken: string;
  mfaMethod: MfaMethod;
  mfaJwtToken: string;
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

export type TOauthTokenExchangeDTO = {
  providerAuthToken: string;
  ip: string;
  userAgent: string;
  email: string;
};
