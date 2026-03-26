export enum UserAuthenticationType {
  EMAIL = "email",
  GOOGLE = "google",
  GITHUB = "github",
  GITLAB = "gitlab",
  OIDC = "oidc",
  SAML = "saml",
  LDAP = "ldap"
}

export type TCreateUserAuthenticationDTO = {
  userId: string;
  type: UserAuthenticationType;
  externalId: string | null;
  domain: string;
};

export type TSwitchUserAuthenticationDTO = {
  userId: string;
  type: UserAuthenticationType;
  externalId: string | null;
  domain: string;
};
