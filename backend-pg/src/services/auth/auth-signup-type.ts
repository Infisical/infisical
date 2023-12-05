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
