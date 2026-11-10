import type { TServerConfig } from "@app/hooks/api/admin/types";
import type {
  TCreateEmailDomainDTO,
  TDeleteEmailDomainDTO,
  TEmailDomain,
  TVerifyEmailDomainDTO
} from "@app/hooks/api/emailDomains/types";
import type {
  TExternalGroupOrgRoleMappingList,
  TSyncExternalGroupOrgRoleMappingsDTO
} from "@app/hooks/api/externalGroupOrgRoleMappings/types";
import type {
  TCreateGithubOrgSyncDTO,
  TGithubOrgSyncConfig,
  TUpdateGithubOrgSyncDTO
} from "@app/hooks/api/githubOrgSyncConfig/types";
import type { TGroupOrgMembership } from "@app/hooks/api/groups/types";
import type {
  useCreateLDAPConfig,
  useTestLDAPConnection,
  useUpdateLDAPConfig
} from "@app/hooks/api/ldapConfig/mutations";
import type { LDAPGroupMap } from "@app/hooks/api/ldapConfig/types";
import type {
  TCreateOauthClientDTO,
  TDeleteOauthClientDTO,
  TOauthClient,
  TRotateOauthClientSecretDTO,
  TUpdateOauthClientDTO
} from "@app/hooks/api/oauthClients/types";
import type { useCreateOIDCConfig, useUpdateOIDCConfig } from "@app/hooks/api/oidcConfig/mutations";
import type { OIDCConfigData } from "@app/hooks/api/oidcConfig/types";
import type {
  CreateScimTokenDTO,
  CreateScimTokenRes,
  DeleteScimTokenDTO,
  GetScimEventsDTO,
  ScimEventData,
  ScimTokenData
} from "@app/hooks/api/scim/types";
import type { useCreateSSOConfig, useUpdateSSOConfig } from "@app/hooks/api/ssoConfig/queries";
import type { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";

import type { V4Mutation, V4QueryResult } from "../contract";
import type { V4InfiniteQueryResult } from "../org/contract";

type VariablesOf<H extends () => { mutateAsync: (...args: never[]) => unknown }> = Parameters<
  ReturnType<H>["mutateAsync"]
>[0];

export type SamlConfig = {
  id: string;
  organization: string;
  orgId: string;
  authProvider: string;
  isActive: boolean;
  entryPoint: string;
  issuer: string;
  cert: string;
  enableGroupSync?: boolean;
  mfaSignalAttribute?: string | null;
  mfaAuthnContexts?: string[] | null;
};

export type LdapConfig = {
  id: string;
  organization: string;
  isActive: boolean;
  url: string;
  bindDN: string;
  bindPass: string;
  uniqueUserAttribute: string;
  searchBase: string;
  searchFilter: string;
  groupSearchBase: string;
  groupSearchFilter: string;
  caCert: string;
  clientCertificate?: string;
  hasClientKeyCertificate?: boolean;
};

export type SsoEntitlements = Pick<
  SubscriptionPlan,
  | "samlSSO"
  | "oidcSSO"
  | "ldap"
  | "groups"
  | "scim"
  | "githubOrgSync"
  | "enforceMfa"
  | "enforceGoogleSSO"
  | "emailDomainVerification"
>;

export type GithubTeamSyncResult = {
  totalUsers: number;
  errors: string[];
  createdTeams: string[];
  updatedTeams: string[];
  removedMemberships: number;
  syncDuration: number;
};

export type SsoAdapter = {
  useServerConfig: () => V4QueryResult<Pick<TServerConfig, "enabledLoginMethods">>;
  useSubscription: (orgId: string) => V4QueryResult<SsoEntitlements>;

  useSamlConfig: (orgId: string) => V4QueryResult<SamlConfig | null>;
  useCreateSamlConfig: V4Mutation<VariablesOf<typeof useCreateSSOConfig>, unknown>;
  useUpdateSamlConfig: V4Mutation<VariablesOf<typeof useUpdateSSOConfig>, unknown>;

  useOidcConfig: (orgId: string) => V4QueryResult<OIDCConfigData | null>;
  useCreateOidcConfig: V4Mutation<VariablesOf<typeof useCreateOIDCConfig>, unknown>;
  useUpdateOidcConfig: V4Mutation<VariablesOf<typeof useUpdateOIDCConfig>, unknown>;

  useLdapConfig: (orgId: string) => V4QueryResult<LdapConfig | null>;
  useCreateLdapConfig: V4Mutation<VariablesOf<typeof useCreateLDAPConfig>, unknown>;
  useUpdateLdapConfig: V4Mutation<VariablesOf<typeof useUpdateLDAPConfig>, unknown>;
  useTestLdapConnection: V4Mutation<VariablesOf<typeof useTestLDAPConnection>, unknown>;
  useLdapGroupMaps: (ldapConfigId: string) => V4QueryResult<LDAPGroupMap[]>;
  useCreateLdapGroupMap: V4Mutation<
    { ldapConfigId: string; ldapGroupCN: string; groupSlug: string },
    unknown
  >;
  useDeleteLdapGroupMap: V4Mutation<{ ldapConfigId: string; ldapGroupMapId: string }, unknown>;
  useOrgGroups: (orgId: string) => V4QueryResult<TGroupOrgMembership[]>;

  useEmailDomains: (orgId: string) => V4QueryResult<TEmailDomain[]>;
  useCreateEmailDomain: V4Mutation<TCreateEmailDomainDTO, TEmailDomain>;
  useVerifyEmailDomain: V4Mutation<TVerifyEmailDomainDTO, TEmailDomain>;
  useDeleteEmailDomain: V4Mutation<TDeleteEmailDomainDTO, TEmailDomain>;

  useScimTokens: (orgId: string) => V4QueryResult<ScimTokenData[] | undefined>;
  useCreateScimToken: V4Mutation<CreateScimTokenDTO, CreateScimTokenRes>;
  useDeleteScimToken: V4Mutation<DeleteScimTokenDTO, CreateScimTokenRes>;
  useScimEvents: (dto: GetScimEventsDTO) => V4InfiniteQueryResult<ScimEventData[]>;
  useExternalGroupRoleMappings: () => V4QueryResult<TExternalGroupOrgRoleMappingList>;
  useUpdateExternalGroupRoleMappings: V4Mutation<TSyncExternalGroupOrgRoleMappingsDTO, unknown>;

  useGithubOrgSyncConfig: () => V4QueryResult<TGithubOrgSyncConfig | undefined>;
  useCreateGithubOrgSyncConfig: V4Mutation<TCreateGithubOrgSyncDTO, unknown>;
  useUpdateGithubOrgSyncConfig: V4Mutation<TUpdateGithubOrgSyncDTO, unknown>;
  useDeleteGithubOrgSyncConfig: V4Mutation<void, unknown>;
  useSyncAllGithubTeams: V4Mutation<void, GithubTeamSyncResult>;

  useOauthClients: (orgId: string) => V4QueryResult<TOauthClient[]>;
  useCreateOauthClient: V4Mutation<
    TCreateOauthClientDTO,
    { client: TOauthClient; clientSecret: string }
  >;
  useUpdateOauthClient: V4Mutation<TUpdateOauthClientDTO, TOauthClient>;
  useDeleteOauthClient: V4Mutation<TDeleteOauthClientDTO, TOauthClient>;
  useRotateOauthClientSecret: V4Mutation<
    TRotateOauthClientSecretDTO,
    { client: TOauthClient; clientSecret: string }
  >;
};
