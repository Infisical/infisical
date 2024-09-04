export enum LoginMethod {
  EMAIL = "email",
  GOOGLE = "google",
  GITHUB = "github",
  GITLAB = "gitlab",
  SAML = "saml",
  LDAP = "ldap",
  OIDC = "oidc"
}

export type TServerConfig = {
  initialized: boolean;
  allowSignUp: boolean;
  allowedSignUpDomain?: string | null;
  isMigrationModeOn?: boolean;
  trustSamlEmails: boolean;
  trustLdapEmails: boolean;
  trustOidcEmails: boolean;
  isSecretScanningDisabled: boolean;
  defaultAuthOrgSlug: string | null;
  defaultAuthOrgId: string | null;
  enabledLoginMethods: LoginMethod[];
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

export type TUpdateAdminSlackConfigDTO = {
  clientId: string;
  clientSecret: string;
};

export type AdminGetUsersFilters = {
  limit: number;
  searchTerm: string;
};

export type AdminSlackConfig = {
  clientId: string;
  clientSecret: string;
};
