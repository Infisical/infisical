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