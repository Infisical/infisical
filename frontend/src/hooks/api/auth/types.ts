export type GetAuthTokenAPI = {
  token: string;
};

export type SendMfaTokenDTO = {
  email: string;
}

export type VerifyMfaTokenDTO = {
  email: string;
  mfaCode: string;
}

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
}

export type Login1DTO = {
  email: string;
  clientPublicKey: string;
  providerAuthToken?: string;
}

export type Login2DTO = {
  email: string;
  clientProof: string;
  providerAuthToken?: string;
}

export type Login1Res = {
  serverPublicKey: string;
  salt: string;
}

export type Login2Res = {
  mfaEnabled: boolean;
  token: string;
  encryptionVersion?: number;
  protectedKey?: string;
  protectedKeyIV?: string;
  protectedKeyTag?: string;
  publicKey?: string;
  encryptedPrivateKey?: string;
  iv?: string;
  tag?: string;
}

export type SRP1DTO = {
  clientPublicKey: string;
}

export type SRPR1Res = {
  serverPublicKey: string;
  salt: string;
}

export type CompleteAccountDTO = {
  email: string;
  firstName: string;
  lastName: string;
  protectedKey: string;
  protectedKeyIV: string;
  protectedKeyTag: string;
  publicKey: string;
  encryptedPrivateKey: string;
  encryptedPrivateKeyIV: string;
  encryptedPrivateKeyTag: string;
  salt: string;
  verifier: string;
}

export type CompleteAccountSignupDTO = CompleteAccountDTO & {
  providerAuthToken?: string;
  attributionSource?: string;
  organizationName: string;
}

export type VerifySignupInviteDTO = {
  email: string;
  code: string;
  organizationId: string;
}

export type ChangePasswordDTO = {
  clientProof: string;
  protectedKey: string;
  protectedKeyIV: string;
  protectedKeyTag: string;
  encryptedPrivateKey: string;
  encryptedPrivateKeyIV: string;
  encryptedPrivateKeyTag: string;
  salt: string;
  verifier: string;
}

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
}

export type IssueBackupPrivateKeyDTO = {
  encryptedPrivateKey: string;
  iv: string;
  tag: string;
  salt: string;
  verifier: string;
  clientProof: string;
}

export type GetBackupEncryptedPrivateKeyDTO = {
  verificationToken: string;
}