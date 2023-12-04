export enum AuthTokenType {
  ACCESS_TOKEN = "accessToken",
  REFRESH_TOKEN = "refreshToken",
  SIGNUP_TOKEN = "signupToken", // TODO: remove in favor of claim
  MFA_TOKEN = "mfaToken", // TODO: remove in favor of claim
  PROVIDER_TOKEN = "providerToken", // TODO: remove in favor of claim
  API_KEY = "apiKey",
  SERVICE_ACCESS_TOKEN = "serviceAccessToken",
  SERVICE_REFRESH_TOKEN = "serviceRefreshToken"
}

export enum AuthMode {
  JWT = "jwt",
  SERVICE_TOKEN = "serviceToken",
  SERVICE_ACCESS_TOKEN = "serviceAccessToken",
  API_KEY = "apiKey",
  API_KEY_V2 = "apiKeyV2"
}

export type TCompleteAccountSignupDTO = {
  email: string;
  firstName: string;
  lastName?: string;
  protectedKey: string;
  protectedKeyIV: string;
  protectedKeyTag: string;
  publicKey: string;
  encryptedPrivateKey: string;
  encryptedPrivateKeyIV: string;
  encryptedPrivateKeyTag: string;
  salt: string;
  verifier: string;
  organizationName: string;
  providerAuthToken?: string | null;
  attributionSource?: string | undefined;
  ip: string;
  userAgent: string;
};
