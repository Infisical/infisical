import { Organization } from "../types";

export enum LoginMethod {
  EMAIL = "email",
  GOOGLE = "google",
  GITHUB = "github",
  GITLAB = "gitlab",
  SAML = "saml",
  LDAP = "ldap",
  OIDC = "oidc"
}

export type OrganizationWithProjects = Organization & {
  members: {
    user: {
      id: string;
      email: string | null;
      username: string;
      firstName: string | null;
      lastName: string | null;
    };
    membershipId: string;
    role: string;
    roleId: string | null;
  }[];
  projects: {
    name: string;
    id: string;
    slug: string;
    createdAt: string;
  }[];
};

export type TServerConfig = {
  initialized: boolean;
  allowSignUp: boolean;
  allowedSignUpDomain?: string | null;
  isMigrationModeOn?: boolean;
  trustSamlEmails: boolean;
  trustLdapEmails: boolean;
  trustOidcEmails: boolean;
  isSecretScanningDisabled: boolean;
  kubernetesAutoFetchServiceAccountToken: boolean;
  defaultAuthOrgSlug: string | null;
  defaultAuthOrgId: string | null;
  defaultAuthOrgAuthMethod?: string | null;
  defaultAuthOrgAuthEnforced?: boolean | null;
  enabledLoginMethods: LoginMethod[];
  authConsentContent?: string;
  pageFrameContent?: string;
  invalidatingCache: boolean;
  fipsEnabled: boolean;
  envOverrides?: Record<string, string>;
};

export type TUpdateServerConfigDTO = {
  slackClientId?: string;
  slackClientSecret?: string;
  microsoftTeamsAppId?: string;
  microsoftTeamsClientSecret?: string;
  microsoftTeamsBotId?: string;
  gitHubAppConnectionClientId?: string;
  gitHubAppConnectionClientSecret?: string;
  gitHubAppConnectionSlug?: string;
  gitHubAppConnectionId?: string;
  gitHubAppConnectionPrivateKey?: string;
  envOverrides?: Record<string, string>;
} & Partial<TServerConfig>;

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

export type AdminGetOrganizationsFilters = {
  limit: number;
  searchTerm: string;
};

export type AdminGetUsersFilters = {
  limit: number;
  searchTerm: string;
  adminsOnly: boolean;
};

export type AdminGetIdentitiesFilters = {
  limit: number;
  searchTerm: string;
};

export type AdminIntegrationsConfig = {
  slack: {
    clientId: string;
    clientSecret: string;
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

export type TGetServerRootKmsEncryptionDetails = {
  strategies: {
    strategy: RootKeyEncryptionStrategy;
    enabled: boolean;
  }[];
};

export enum RootKeyEncryptionStrategy {
  Software = "SOFTWARE",
  HSM = "HSM"
}

export enum CacheType {
  ALL = "all",
  SECRETS = "secrets"
}

export type TInvalidateCacheDTO = {
  type: CacheType;
};

export type TGetInvalidatingCacheStatus = {
  invalidating: boolean;
};

export interface TGetEnvOverrides {
  [key: string]: {
    name: string;
    fields: { key: string; value: string; hasEnvEntry: boolean; description?: string }[];
  };
}
