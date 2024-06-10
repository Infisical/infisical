export type TServerConfig = {
  initialized: boolean;
  allowSignUp: boolean;
  allowedSignUpDomain?: string | null;
  isMigrationModeOn?: boolean;
  trustSamlEmails: boolean;
  trustLdapEmails: boolean;
  isSecretScanningDisabled: boolean;
};

export type TCreateAdminUserDTO = {
  email: string;
  password: string;
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
