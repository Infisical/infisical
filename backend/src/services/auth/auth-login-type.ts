import { AuthMethod, MfaMethod, ProviderAuthResult } from "./auth-type";

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
  isRecoveryCode?: boolean;
};

export type TOauthLoginDTO = {
  email: string;
  firstName: string;
  lastName?: string;
  authMethod: AuthMethod;
  callbackPort?: number;
  orgSlug?: string;
  providerUserId: string;
  ip: string;
  userAgent: string;
};

export type TProcessProviderCallbackDTO = {
  user: {
    id: string;
    isAccepted?: boolean | null;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    isLocked?: boolean | null;
  };
  authMethod: AuthMethod;
  isEmailVerified: boolean;
  aliasId?: string;
  ip: string;
  userAgent: string;
  organizationId?: string;
  callbackPort?: number;
};

export type TProviderAuthResult =
  | { result: ProviderAuthResult.SESSION; tokens: { access: string; refresh: string }; callbackPort?: number }
  | { result: ProviderAuthResult.MFA_REQUIRED; mfaToken: string; mfaMethod: MfaMethod; callbackPort?: number }
  | { result: ProviderAuthResult.SIGNUP_REQUIRED; signupToken: string; callbackPort?: number };
