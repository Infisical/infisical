export type TAdminSignUpDTO = {
  email: string;
  password: string;
  publicKey: string;
  salt: string;
  lastName?: string;
  verifier: string;
  firstName: string;
  protectedKey: string;
  protectedKeyIV: string;
  protectedKeyTag: string;
  encryptedPrivateKey: string;
  encryptedPrivateKeyIV: string;
  encryptedPrivateKeyTag: string;
  ip: string;
  userAgent: string;
};

export type TAdminGetUsersDTO = {
  offset: number;
  limit: number;
  searchTerm: string;
};

export enum LoginMethod {
  EMAIL = "email",
  GOOGLE = "google",
  GITHUB = "github",
  GITLAB = "gitlab",
  SAML = "saml",
  LDAP = "ldap",
  OIDC = "oidc"
}
