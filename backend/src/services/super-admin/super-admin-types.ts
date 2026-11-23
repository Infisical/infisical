import { TEnvConfig } from "@app/lib/config/env";

export type TAdminSignUpDTO = {
  email: string;
  password: string;
  lastName?: string;
  firstName: string;
  organizationName?: string;
  ip: string;
  userAgent: string;
  activationToken?: string;
};

export type TAdminBootstrapInstanceDTO = {
  email: string;
  password: string;
  organizationName: string;
  activationToken?: string;
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

export type TAdminGetEmailDomainsDTO = {
  offset: number;
  limit: number;
  searchTerm: string;
};

export type TAdminCreateEmailDomainDTO = {
  orgId: string;
  domain: string;
};

export type TAdminDeleteEmailDomainDTO = {
  emailDomainId: string;
};

export type TCreateOrganizationDTO = {
  name: string;
  inviteAdminEmails: string[];
};

export type TResendOrgInviteDTO = {
  organizationId: string;
  membershipId: string;
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

export enum SuperAdminErrorCode {
  AuthMethodLockout = "SUPER_ADMIN_AUTH_METHOD_LOCKOUT",
  InvalidActivationToken = "SUPER_ADMIN_INVALID_ACTIVATION_TOKEN",
  InstanceAlreadySetUp = "SUPER_ADMIN_INSTANCE_ALREADY_SET_UP"
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
