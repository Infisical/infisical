export type TServerConfig = {
  initialized: boolean;
  allowSignUp: boolean;
};

export type TCreateAdminUserDTO = {
  email: string;
  firstName: string;
  lastName?: string;
  protectedKey: string;
  protectedKeyTag: string;
  protectedKeyIV: string;
  encryptedPrivateKey: string;
  encryptedPrivateKeyIV: string;
  encryptedPrivateKeyTag: string;
  publicKey: string;
  verifier: string;
  salt: string;
};
