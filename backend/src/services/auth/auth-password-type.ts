export type TChangePasswordDTO = {
  userId: string;
  clientProof: string;
  protectedKey: string;
  protectedKeyIV: string;
  protectedKeyTag: string;
  encryptedPrivateKey: string;
  encryptedPrivateKeyIV: string;
  encryptedPrivateKeyTag: string;
  salt: string;
  verifier: string;
  tokenVersionId?: string;
  password: string;
};

export type TResetPasswordViaBackupKeyDTO = {
  userId: string;
  protectedKey: string;
  protectedKeyIV: string;
  protectedKeyTag: string;
  encryptedPrivateKey: string;
  encryptedPrivateKeyIV: string;
  encryptedPrivateKeyTag: string;
  salt: string;
  verifier: string;
  password: string;
};

export type TSetupPasswordViaBackupKeyDTO = {
  protectedKey: string;
  protectedKeyIV: string;
  protectedKeyTag: string;
  encryptedPrivateKey: string;
  encryptedPrivateKeyIV: string;
  encryptedPrivateKeyTag: string;
  salt: string;
  verifier: string;
  password: string;
  token: string;
};

export type TCreateBackupPrivateKeyDTO = {
  userId: string;
  clientProof: string;
  encryptedPrivateKey: string;
  salt: string;
  iv: string;
  tag: string;
  verifier: string;
};
