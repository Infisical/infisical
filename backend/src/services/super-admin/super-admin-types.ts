import { TEnvConfig } from "@app/lib/config/env";

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

export type TAdminBootstrapInstanceDTO = {
  email: string;
  password: string;
  organizationName: string;
};

export type TAdminGetUsersDTO = {
  offset: number;
  limit: number;
  searchTerm: string;
  adminsOnly: boolean;
};

export type TAdminGetIdentitiesDTO = {
  offset: number;
  limit: number;
  searchTerm: string;
};

export type TGetOrganizationsDTO = {
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

export enum CacheType {
  ALL = "all",
  SECRETS = "secrets"
}

export type TAdminIntegrationConfig = {
  slack: {
    clientSecret: string;
    clientId: string;
  };
  microsoftTeams: {
    appId: string;
    clientSecret: string;
    botId: string;
  };
  gitHubAppConnection: {
    clientId: string;
    clientSecret: string;
    appSlug: string;
    appId: string;
    privateKey: string;
  };
};

export interface EnvOverrides {
  [key: string]: {
    name: string;
    fields: { key: keyof TEnvConfig; value: string; hasEnvEntry: boolean; description?: string }[];
  };
}
