import { useQuery } from "@tanstack/react-query";

import { useGetServerConfig } from "@app/hooks/api/admin/queries";
import {
  useCreateEmailDomain,
  useDeleteEmailDomain,
  useVerifyEmailDomain
} from "@app/hooks/api/emailDomains/mutations";
import { useGetEmailDomains } from "@app/hooks/api/emailDomains/queries";
import { useUpdateExternalGroupOrgRoleMappings } from "@app/hooks/api/externalGroupOrgRoleMappings/mutations";
import { useGetExternalGroupOrgRoleMappings } from "@app/hooks/api/externalGroupOrgRoleMappings/queries";
import {
  useCreateGithubSyncOrgConfig,
  useDeleteGithubSyncOrgConfig,
  useSyncAllGithubTeams,
  useUpdateGithubSyncOrgConfig
} from "@app/hooks/api/githubOrgSyncConfig/mutations";
import { githubOrgSyncConfigQueryKeys } from "@app/hooks/api/githubOrgSyncConfig/queries";
import {
  useCreateLDAPConfig,
  useCreateLDAPGroupMapping,
  useDeleteLDAPGroupMapping,
  useTestLDAPConnection,
  useUpdateLDAPConfig
} from "@app/hooks/api/ldapConfig/mutations";
import { useGetLDAPConfig, useGetLDAPGroupMaps } from "@app/hooks/api/ldapConfig/queries";
import {
  useCreateOauthClient,
  useDeleteOauthClient,
  useRotateOauthClientSecret,
  useUpdateOauthClient
} from "@app/hooks/api/oauthClients/mutations";
import { useGetOauthClients } from "@app/hooks/api/oauthClients/queries";
import { useCreateOIDCConfig, useUpdateOIDCConfig } from "@app/hooks/api/oidcConfig/mutations";
import { useGetOIDCConfig } from "@app/hooks/api/oidcConfig/queries";
import { useGetOrganizationGroups } from "@app/hooks/api/organization/queries";
import { useCreateScimToken, useDeleteScimToken } from "@app/hooks/api/scim/mutations";
import { useGetScimEvents, useGetScimTokens } from "@app/hooks/api/scim/queries";
import {
  useCreateSSOConfig,
  useGetSSOConfig,
  useUpdateSSOConfig
} from "@app/hooks/api/ssoConfig/queries";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import type { SsoAdapter } from "./contract";

export const ssoLive: SsoAdapter = {
  useServerConfig: () => useGetServerConfig(),
  useSubscription: (orgId) => useGetOrgSubscription({ orgID: orgId }),
  useSamlConfig: useGetSSOConfig,
  useCreateSamlConfig: useCreateSSOConfig,
  useUpdateSamlConfig: useUpdateSSOConfig,
  useOidcConfig: useGetOIDCConfig,
  useCreateOidcConfig: useCreateOIDCConfig,
  useUpdateOidcConfig: useUpdateOIDCConfig,
  useLdapConfig: useGetLDAPConfig,
  useCreateLdapConfig: useCreateLDAPConfig,
  useUpdateLdapConfig: useUpdateLDAPConfig,
  useTestLdapConnection: useTestLDAPConnection,
  useLdapGroupMaps: useGetLDAPGroupMaps,
  useCreateLdapGroupMap: useCreateLDAPGroupMapping,
  useDeleteLdapGroupMap: useDeleteLDAPGroupMapping,
  useOrgGroups: useGetOrganizationGroups,
  useEmailDomains: useGetEmailDomains,
  useCreateEmailDomain,
  useVerifyEmailDomain,
  useDeleteEmailDomain,
  useScimTokens: useGetScimTokens,
  useCreateScimToken,
  useDeleteScimToken,
  useScimEvents: useGetScimEvents,
  useExternalGroupRoleMappings: () => useGetExternalGroupOrgRoleMappings(),
  useUpdateExternalGroupRoleMappings: useUpdateExternalGroupOrgRoleMappings,
  useGithubOrgSyncConfig: ({ enabled } = {}) =>
    useQuery({ ...githubOrgSyncConfigQueryKeys.get(), enabled, retry: false }),
  useCreateGithubOrgSyncConfig: useCreateGithubSyncOrgConfig,
  useUpdateGithubOrgSyncConfig: useUpdateGithubSyncOrgConfig,
  useDeleteGithubOrgSyncConfig: useDeleteGithubSyncOrgConfig,
  useSyncAllGithubTeams,
  useOauthClients: useGetOauthClients,
  useCreateOauthClient,
  useUpdateOauthClient,
  useDeleteOauthClient,
  useRotateOauthClientSecret
};
