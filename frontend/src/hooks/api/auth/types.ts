export type GetAuthTokenAPI = {
  token: string;
  organizationId?: string;
  subOrganizationId?: string;
};

export enum UserEncryptionVersion {
  V1 = 1,
  V2 = 2
}

export type SendMfaTokenDTO = {
  email: string;
};

export type VerifyMfaTokenDTO = {
  email: string;
  mfaCode: string;
  mfaMethod: MfaMethod;
};

export type VerifyMfaTokenRes = {
  encryptionVersion: number;
  protectedKey?: string;
  protectedKeyIV?: string;
  protectedKeyTag?: string;
  token: string;
  publicKey: string;
  encryptedPrivateKey: string;
  iv: string;
  tag: string;
};

export type TOauthTokenExchangeDTO = {
  providerAuthToken: string;
  email: string;
};

export type Login1DTO = {
  email: string;
  clientPublicKey: string;
  providerAuthToken?: string;
};

export type Login2DTO = {
  captchaToken?: string;
  email: string;
  clientProof: string;
  providerAuthToken?: string;
  password: string;
};

export type LoginV3DTO = {
  email: string;
  password: string;
  providerAuthToken?: string;
  captchaToken?: string;
};

export type Login1Res = {
  serverPublicKey: string;
  salt: string;
};

export type Login2Res = {
  token: string;
  encryptionVersion?: number;
  protectedKey?: string;
  protectedKeyIV?: string;
  protectedKeyTag?: string;
  publicKey?: string;
  encryptedPrivateKey?: string;
  iv?: string;
  tag?: string;
};

export type LoginV3Res = {
  accessToken: string;
  mfaEnabled: boolean;
};

export type LoginLDAPDTO = {
  organizationSlug: string;
  username: string;
  password: string;
};

export type LoginLDAPRes = {
  nextUrl: string;
};

export type CompleteAccountDTO = {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  tokenMetadata?: string;
};

export type CompleteAccountSignupDTO = CompleteAccountDTO & {
  providerAuthToken?: string;
  attributionSource?: string;
  organizationName: string;
  useDefaultOrg?: boolean;
};

export type VerifySignupInviteDTO = {
  email: string;
  code: string;
  organizationId: string;
};

export type ResetPasswordDTO = {
  protectedKey: string;
  protectedKeyIV: string;
  protectedKeyTag: string;
  encryptedPrivateKey: string;
  encryptedPrivateKeyIV: string;
  encryptedPrivateKeyTag: string;
  salt: string;
  verifier: string;
  verificationToken: string;
  password: string;
};

export type ResetPasswordV2DTO = {
  newPassword: string;
  verificationToken: string;
};

export type ResetUserPasswordV2DTO = {
  oldPassword: string;
  newPassword: string;
};

export type SetupPasswordDTO = {
  email: string;
  token: string;
  password: string;
};

export type GetBackupEncryptedPrivateKeyDTO = {
  verificationToken: string;
};

export enum UserAgentType {
  CLI = "cli"
}

export enum MfaMethod {
  EMAIL = "email",
  TOTP = "totp",
  WEBAUTHN = "webauthn"
}
