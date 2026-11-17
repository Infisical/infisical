import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { apiRequest } from "@app/config/request";
import { MAX_IDENTITY_ACCESS_TOKEN_TTL_FALLBACK } from "@app/helpers/identityAuthSchemas";
import { useRevokeAccessRequest } from "@app/hooks/api/accessApproval/mutation";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections/queries";
import { useAssumeProjectPrivileges } from "@app/hooks/api/assumePrivileges/mutations";
import {
  useAddIdentityToGroup,
  useAddUserToGroup,
  useCreateGroup,
  useDeleteGroup,
  useRemoveIdentityFromGroup,
  useRemoveUserFromGroup,
  useUpdateGroup
} from "@app/hooks/api/groups/mutations";
import { groupByIdQuery, groupKeys, useListGroupMembers } from "@app/hooks/api/groups/queries";
import { FilterReturnedProjects, type TGroupProject } from "@app/hooks/api/groups/types";
import {
  useAddIdentityAliCloudAuth,
  useAddIdentityAwsAuth,
  useAddIdentityAzureAuth,
  useAddIdentityGcpAuth,
  useAddIdentityJwtAuth,
  useAddIdentityKubernetesAuth,
  useAddIdentityLdapAuth,
  useAddIdentityOciAuth,
  useAddIdentityOidcAuth,
  useAddIdentitySpiffeAuth,
  useAddIdentityTlsCertAuth,
  useAddIdentityTokenAuth,
  useAddIdentityUniversalAuth,
  useClearIdentityLdapAuthLockouts,
  useClearIdentityUniversalAuthLockouts,
  useCreateIdentityUniversalAuthClientSecret,
  useCreateTokenIdentityTokenAuth,
  useDeleteIdentityAliCloudAuth,
  useDeleteIdentityAwsAuth,
  useDeleteIdentityAzureAuth,
  useDeleteIdentityGcpAuth,
  useDeleteIdentityJwtAuth,
  useDeleteIdentityKubernetesAuth,
  useDeleteIdentityLdapAuth,
  useDeleteIdentityOciAuth,
  useDeleteIdentityOidcAuth,
  useDeleteIdentitySpiffeAuth,
  useDeleteIdentityTlsCertAuth,
  useDeleteIdentityTokenAuth,
  useDeleteIdentityUniversalAuth,
  useRevokeIdentityTokenAuthToken,
  useRevokeIdentityUniversalAuthClientSecret,
  useUpdateIdentityAliCloudAuth,
  useUpdateIdentityAwsAuth,
  useUpdateIdentityAzureAuth,
  useUpdateIdentityGcpAuth,
  useUpdateIdentityJwtAuth,
  useUpdateIdentityKubernetesAuth,
  useUpdateIdentityLdapAuth,
  useUpdateIdentityOciAuth,
  useUpdateIdentityOidcAuth,
  useUpdateIdentitySpiffeAuth,
  useUpdateIdentityTlsCertAuth,
  useUpdateIdentityTokenAuth,
  useUpdateIdentityTokenAuthToken,
  useUpdateIdentityUniversalAuth
} from "@app/hooks/api/identities/mutations";
import {
  identitiesKeys,
  identityProjectMembershipsQuery,
  useCountOrgIdentityMemberships,
  useGetIdentityAliCloudAuth,
  useGetIdentityAwsAuth,
  useGetIdentityAzureAuth,
  useGetIdentityGcpAuth,
  useGetIdentityJwtAuth,
  useGetIdentityKubernetesAuth,
  useGetIdentityLdapAuth,
  useGetIdentityOciAuth,
  useGetIdentityOidcAuth,
  useGetIdentitySpiffeAuth,
  useGetIdentityTlsCertAuth,
  useGetIdentityTokenAuth,
  useGetIdentityTokensTokenAuth,
  useGetIdentityUniversalAuth,
  useGetIdentityUniversalAuthClientSecrets,
  useGetOrgIdentityMembershipById,
  useSearchOrgIdentityMemberships
} from "@app/hooks/api/identities/queries";
import {
  useCreateIdentityAuthTemplate,
  useDeleteIdentityAuthTemplate,
  useUpdateIdentityAuthTemplate
} from "@app/hooks/api/identityAuthTemplates/mutations";
import {
  useGetAvailableTemplates,
  useGetIdentityAuthTemplates,
  useGetTemplateUsages
} from "@app/hooks/api/identityAuthTemplates/queries";
import type { IdentityAuthTemplate } from "@app/hooks/api/identityAuthTemplates/types";
import {
  useCreateIdentityProjectAdditionalPrivilege,
  useDeleteIdentityProjectAdditionalPrivilege,
  useUpdateIdentityProjectAdditionalPrivilege
} from "@app/hooks/api/identityProjectAdditionalPrivilege/mutation";
import {
  identitiyProjectPrivilegeKeys,
  useGetIdentityProjectPrivilegeDetails,
  useListIdentityProjectPrivileges
} from "@app/hooks/api/identityProjectAdditionalPrivilege/queries";
import {
  useGetVaultMounts,
  useGetVaultNamespaces,
  useGetVaultPolicies
} from "@app/hooks/api/migration/queries";
import {
  useGetOrganizationById,
  useSearchOrganizationGroups,
  useUpdateOrg
} from "@app/hooks/api/organization/queries";
import {
  useCreateOrgIdentity,
  useDeleteOrgIdentity,
  useUpdateOrgIdentity
} from "@app/hooks/api/orgIdentity/mutations";
import { pamKeys, resolvePamProjectId } from "@app/hooks/api/pam/queries";
import { useUpdateProjectIdentity } from "@app/hooks/api/projectIdentity";
import {
  useCreateProjectIdentity,
  useDeleteProjectIdentity
} from "@app/hooks/api/projectIdentity/mutations";
import {
  useCreateProjectIdentityMembership,
  useDeleteProjectIdentityMembership,
  useUpdateProjectIdentityMembership
} from "@app/hooks/api/projectIdentityMembership/mutations";
import {
  useGetProjectIdentityMembershipV2,
  useListProjectIdentityMemberships
} from "@app/hooks/api/projectIdentityMembership/queries";
import {
  useAddGroupToWorkspace,
  useDeleteGroupFromWorkspace,
  useUpdateGroupWorkspaceRole
} from "@app/hooks/api/projects/mutations";
import {
  useDeleteUserFromWorkspace,
  useGetIdentityPermissionAudit,
  useGetMembershipPermissionAudit,
  useGetAvailableProjectUsers,
  useGetWorkspaceGroupMembershipDetails,
  useGetWorkspaceUserDetails,
  useGetWorkspaceUsers,
  useListWorkspaceGroups,
  useUpdateUserWorkspaceRole
} from "@app/hooks/api/projects/queries";
import {
  useCreateProjectUserAdditionalPrivilege,
  useDeleteProjectUserAdditionalPrivilege,
  useUpdateProjectUserAdditionalPrivilege
} from "@app/hooks/api/projectUserAdditionalPrivilege/mutation";
import {
  projectUserPrivilegeKeys,
  useGetProjectUserPrivilegeDetails,
  useListProjectUserPrivileges
} from "@app/hooks/api/projectUserAdditionalPrivilege/queries";
import {
  useCreateOrgRole,
  useCreateProjectRole,
  useDeleteOrgRole,
  useDeleteProjectRole,
  useUpdateOrgRole,
  useUpdateProjectRole
} from "@app/hooks/api/roles/mutation";
import {
  useGetOrgRole,
  useGetOrgRoles,
  useGetProjectRoleBySlug,
  useGetProjectRoles,
  useGetUserOrgPermissions,
  useGetUserProjectPermissions
} from "@app/hooks/api/roles/queries";
import { useListProjectEnvironmentsFolders } from "@app/hooks/api/secretFolders/queries";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import {
  useCreateServiceToken,
  useDeleteServiceToken,
  useGetUserWsServiceTokens
} from "@app/hooks/api/serviceTokens/queries";
import { useGetWsTags } from "@app/hooks/api/tags/queries";
import { useAddUserToWsNonE2EE, useResendOrgMemberInvitation } from "@app/hooks/api/users/mutation";
import {
  useAddUsersToOrg,
  useDeleteOrgMembership,
  useDeleteOrgMembershipBatch,
  useGetOrgMembership,
  useGetOrgMembershipProjectMemberships,
  useGetOrgUserAccess,
  useListUserGroupMemberships,
  useUpdateOrgMembership
} from "@app/hooks/api/users/queries";

import type { V4QueryResult } from "../contract";
import { useProjectById } from "../projectQuery";
import type { AccessAdapter } from "./contract";

const useOrgId = () => useParams({ from: "/v4/organizations/$orgId" }).orgId;

type IdentityAuthMutationHook = () => { mutateAsync: (variables: never) => Promise<unknown> };

const withIdentitySearchRefresh = <H extends IdentityAuthMutationHook>(useMutationHook: H): H => {
  const useRefreshingMutation = () => {
    const queryClient = useQueryClient();
    const mutation = useMutationHook();
    const mutateAsync = mutation.mutateAsync as (variables: unknown) => Promise<unknown>;
    return {
      ...mutation,
      mutateAsync: async (variables: unknown) => {
        const result = await mutateAsync(variables);
        await queryClient.invalidateQueries({ queryKey: identitiesKeys.searchIdentitiesRoot });
        return result;
      }
    };
  };
  return useRefreshingMutation as unknown as H;
};

export const accessLive: AccessAdapter = {
  useOrgPermission: useGetUserOrgPermissions,
  useProjectPermission: useGetUserProjectPermissions,
  useOrganization: useGetOrganizationById,
  useUpdateOrganization: useUpdateOrg,
  useProject: useProjectById,
  usePamProjectId: (orgId) => {
    const { data: organization } = useGetOrganizationById(orgId);
    return useQuery({
      queryKey: [...pamKeys.all, "project-id", orgId],
      queryFn: () => resolvePamProjectId(organization?.pamProjectId),
      enabled: Boolean(organization)
    });
  },

  useOrgUsers: useGetOrgUserAccess,
  useOrgMembership: useGetOrgMembership,
  useOrgMembershipProjectMemberships: useGetOrgMembershipProjectMemberships,
  useUserGroupMemberships: useListUserGroupMemberships,
  useInviteOrgUsers: useAddUsersToOrg,
  useUpdateOrgMembership,
  useDeleteOrgMembership,
  useDeleteOrgMemberships: useDeleteOrgMembershipBatch,
  useResendOrgInvite: useResendOrgMemberInvitation,

  useOrgRoles: useGetOrgRoles,
  useOrgRole: useGetOrgRole,
  useCreateOrgRole,
  useUpdateOrgRole,
  useDeleteOrgRole,

  useSearchOrgIdentities: useSearchOrgIdentityMemberships,
  useOrgIdentity: useGetOrgIdentityMembershipById,
  useIdentityProjectMemberships: (identityId) =>
    useQuery(identityProjectMembershipsQuery(useOrgId(), identityId)),
  useCreateOrgIdentity,
  useUpdateOrgIdentity,
  useDeleteOrgIdentity,
  useIdentityUniversalAuth: useGetIdentityUniversalAuth,
  useIdentityUniversalAuthClientSecrets: useGetIdentityUniversalAuthClientSecrets,
  useAddIdentityUniversalAuth: withIdentitySearchRefresh(useAddIdentityUniversalAuth),
  useUpdateIdentityUniversalAuth: withIdentitySearchRefresh(useUpdateIdentityUniversalAuth),
  useDeleteIdentityUniversalAuth: withIdentitySearchRefresh(useDeleteIdentityUniversalAuth),
  useCreateIdentityUniversalAuthClientSecret,
  useRevokeIdentityUniversalAuthClientSecret,
  useClearIdentityUniversalAuthLockouts,
  useIdentityAuthTemplates: useGetIdentityAuthTemplates,
  useIdentityAuthTemplateUsages: useGetTemplateUsages,
  useCreateIdentityAuthTemplate,
  useUpdateIdentityAuthTemplate,
  useDeleteIdentityAuthTemplate,
  useCountOrgIdentities: useCountOrgIdentityMemberships,
  useIdentityTokenAuth: useGetIdentityTokenAuth,
  useIdentityTokenAuthTokens: useGetIdentityTokensTokenAuth,
  useCreateIdentityTokenAuthToken: useCreateTokenIdentityTokenAuth,
  useRevokeIdentityTokenAuthToken,
  useDeleteIdentityTokenAuth: withIdentitySearchRefresh(useDeleteIdentityTokenAuth),
  useIdentityKubernetesAuth: useGetIdentityKubernetesAuth,
  useDeleteIdentityKubernetesAuth: withIdentitySearchRefresh(useDeleteIdentityKubernetesAuth),
  useIdentityAwsAuth: useGetIdentityAwsAuth,
  useDeleteIdentityAwsAuth: withIdentitySearchRefresh(useDeleteIdentityAwsAuth),
  useIdentityOidcAuth: useGetIdentityOidcAuth,
  useDeleteIdentityOidcAuth: withIdentitySearchRefresh(useDeleteIdentityOidcAuth),
  useAddIdentityTokenAuth: withIdentitySearchRefresh(useAddIdentityTokenAuth),
  useUpdateIdentityTokenAuth: withIdentitySearchRefresh(useUpdateIdentityTokenAuth),
  useAddIdentityKubernetesAuth: withIdentitySearchRefresh(useAddIdentityKubernetesAuth),
  useUpdateIdentityKubernetesAuth: withIdentitySearchRefresh(useUpdateIdentityKubernetesAuth),
  useAddIdentityAwsAuth: withIdentitySearchRefresh(useAddIdentityAwsAuth),
  useUpdateIdentityAwsAuth: withIdentitySearchRefresh(useUpdateIdentityAwsAuth),
  useAddIdentityOidcAuth: withIdentitySearchRefresh(useAddIdentityOidcAuth),
  useUpdateIdentityOidcAuth: withIdentitySearchRefresh(useUpdateIdentityOidcAuth),
  useIdentityGcpAuth: useGetIdentityGcpAuth,
  useAddIdentityGcpAuth: withIdentitySearchRefresh(useAddIdentityGcpAuth),
  useUpdateIdentityGcpAuth: withIdentitySearchRefresh(useUpdateIdentityGcpAuth),
  useDeleteIdentityGcpAuth: withIdentitySearchRefresh(useDeleteIdentityGcpAuth),
  useIdentityAzureAuth: useGetIdentityAzureAuth,
  useAddIdentityAzureAuth: withIdentitySearchRefresh(useAddIdentityAzureAuth),
  useUpdateIdentityAzureAuth: withIdentitySearchRefresh(useUpdateIdentityAzureAuth),
  useDeleteIdentityAzureAuth: withIdentitySearchRefresh(useDeleteIdentityAzureAuth),
  useIdentityAliCloudAuth: useGetIdentityAliCloudAuth,
  useAddIdentityAliCloudAuth: withIdentitySearchRefresh(useAddIdentityAliCloudAuth),
  useUpdateIdentityAliCloudAuth: withIdentitySearchRefresh(useUpdateIdentityAliCloudAuth),
  useDeleteIdentityAliCloudAuth: withIdentitySearchRefresh(useDeleteIdentityAliCloudAuth),
  useIdentityOciAuth: useGetIdentityOciAuth,
  useAddIdentityOciAuth: withIdentitySearchRefresh(useAddIdentityOciAuth),
  useUpdateIdentityOciAuth: withIdentitySearchRefresh(useUpdateIdentityOciAuth),
  useDeleteIdentityOciAuth: withIdentitySearchRefresh(useDeleteIdentityOciAuth),
  useIdentityLdapAuth: useGetIdentityLdapAuth,
  useAddIdentityLdapAuth: withIdentitySearchRefresh(useAddIdentityLdapAuth),
  useUpdateIdentityLdapAuth: withIdentitySearchRefresh(useUpdateIdentityLdapAuth),
  useDeleteIdentityLdapAuth: withIdentitySearchRefresh(useDeleteIdentityLdapAuth),
  useIdentityJwtAuth: useGetIdentityJwtAuth,
  useAddIdentityJwtAuth: withIdentitySearchRefresh(useAddIdentityJwtAuth),
  useUpdateIdentityJwtAuth: withIdentitySearchRefresh(useUpdateIdentityJwtAuth),
  useDeleteIdentityJwtAuth: withIdentitySearchRefresh(useDeleteIdentityJwtAuth),
  useIdentityTlsCertAuth: useGetIdentityTlsCertAuth,
  useAddIdentityTlsCertAuth: withIdentitySearchRefresh(useAddIdentityTlsCertAuth),
  useUpdateIdentityTlsCertAuth: withIdentitySearchRefresh(useUpdateIdentityTlsCertAuth),
  useDeleteIdentityTlsCertAuth: withIdentitySearchRefresh(useDeleteIdentityTlsCertAuth),
  useIdentitySpiffeAuth: useGetIdentitySpiffeAuth,
  useAddIdentitySpiffeAuth: withIdentitySearchRefresh(useAddIdentitySpiffeAuth),
  useUpdateIdentitySpiffeAuth: withIdentitySearchRefresh(useUpdateIdentitySpiffeAuth),
  useDeleteIdentitySpiffeAuth: withIdentitySearchRefresh(useDeleteIdentitySpiffeAuth),
  useUpdateIdentityTokenAuthToken,
  useClearIdentityLdapAuthLockouts,
  useIdentityAccessTokenMaxTtl: () =>
    useFetchServerStatus().data?.maxIdentityAccessTokenTTL ??
    MAX_IDENTITY_ACCESS_TOKEN_TTL_FALLBACK,
  useAvailableIdentityAuthTemplates: (authMethod, options) =>
    useGetAvailableTemplates(authMethod, options) as V4QueryResult<IdentityAuthTemplate[]>,

  useOrgGroups: useSearchOrganizationGroups,
  useGroup: (groupId) => useQuery(groupByIdQuery(useOrgId(), groupId)),
  useGroupMembers: useListGroupMembers,
  useGroupProjects: (groupId) =>
    useQuery({
      queryKey: [...groupKeys.forGroupProjects(groupId), "assigned"],
      enabled: Boolean(groupId),
      queryFn: async () => {
        const fetchPage = async (offset: number) => {
          const { data } = await apiRequest.get<{ projects: TGroupProject[]; totalCount: number }>(
            `/api/v1/groups/${groupId}/projects`,
            {
              params: { offset, limit: 100, filter: FilterReturnedProjects.ASSIGNED_PROJECTS }
            }
          );
          return data;
        };
        const first = await fetchPage(0);
        const offsets = [];
        for (let offset = 100; offset < first.totalCount; offset += 100) offsets.push(offset);
        const rest = await Promise.all(offsets.map(fetchPage));
        return [first, ...rest].flatMap((page) => page.projects);
      }
    }),
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
  useAddUserToGroup,
  useRemoveUserFromGroup,
  useAddIdentityToGroup,
  useRemoveIdentityFromGroup,

  useProjectUsers: useGetWorkspaceUsers,
  useProjectUser: useGetWorkspaceUserDetails,
  useAvailableProjectUsers: useGetAvailableProjectUsers,
  useAddProjectUsers: useAddUserToWsNonE2EE,
  useUpdateProjectUserRoles: useUpdateUserWorkspaceRole,
  useRemoveProjectUsers: useDeleteUserFromWorkspace,
  useAssumeProjectPrivileges,
  useMembershipPermissionAudit: useGetMembershipPermissionAudit,
  useIdentityPermissionAudit: useGetIdentityPermissionAudit,
  useProjectUserPrivileges: useListProjectUserPrivileges,
  useProjectUserPrivilege: useGetProjectUserPrivilegeDetails,
  useCreateProjectUserPrivilege: useCreateProjectUserAdditionalPrivilege,
  useUpdateProjectUserPrivilege: () => {
    const queryClient = useQueryClient();
    const update = useUpdateProjectUserAdditionalPrivilege();
    return {
      ...update,
      mutateAsync: async (dto) => {
        const result = await update.mutateAsync(dto);
        await queryClient.invalidateQueries({
          queryKey: projectUserPrivilegeKeys.details(dto.privilegeId)
        });
        return result;
      }
    };
  },
  useDeleteProjectUserPrivilege: useDeleteProjectUserAdditionalPrivilege,
  useRevokeProjectUserPrivilegeRequest: () => {
    const queryClient = useQueryClient();
    const revoke = useRevokeAccessRequest();
    return {
      ...revoke,
      mutateAsync: async ({ projectMembershipId, ...dto }) => {
        const result = await revoke.mutateAsync(dto);
        await queryClient.invalidateQueries({
          queryKey: projectUserPrivilegeKeys.list(projectMembershipId)
        });
        return result;
      }
    };
  },
  useIdentityProjectPrivileges: useListIdentityProjectPrivileges,
  useIdentityProjectPrivilege: useGetIdentityProjectPrivilegeDetails,
  useCreateIdentityProjectPrivilege: useCreateIdentityProjectAdditionalPrivilege,
  useUpdateIdentityProjectPrivilege: () => {
    const queryClient = useQueryClient();
    const update = useUpdateIdentityProjectAdditionalPrivilege();
    return {
      ...update,
      mutateAsync: async (dto) => {
        const result = await update.mutateAsync(dto);
        await queryClient.invalidateQueries({
          queryKey: identitiyProjectPrivilegeKeys.details({
            projectId: dto.projectId,
            identityId: dto.identityId,
            privilegeId: dto.privilegeId
          })
        });
        return result;
      }
    };
  },
  useDeleteIdentityProjectPrivilege: useDeleteIdentityProjectAdditionalPrivilege,

  useProjectIdentities: useListProjectIdentityMemberships,
  useProjectIdentity: useGetProjectIdentityMembershipV2,
  useAddProjectIdentity: useCreateProjectIdentityMembership,
  useUpdateProjectIdentityRoles: useUpdateProjectIdentityMembership,
  useRemoveProjectIdentity: useDeleteProjectIdentityMembership,
  useCreateProjectManagedIdentity: useCreateProjectIdentity,
  useDeleteProjectManagedIdentity: useDeleteProjectIdentity,
  useUpdateProjectManagedIdentity: useUpdateProjectIdentity,

  useProjectGroups: useListWorkspaceGroups,
  useProjectGroup: useGetWorkspaceGroupMembershipDetails,
  useAddProjectGroup: useAddGroupToWorkspace,
  useUpdateProjectGroupRoles: useUpdateGroupWorkspaceRole,
  useRemoveProjectGroup: useDeleteGroupFromWorkspace,

  useServiceTokens: useGetUserWsServiceTokens,
  useCreateServiceToken,
  useDeleteServiceToken,

  useProjectRoles: useGetProjectRoles,
  useProjectRole: useGetProjectRoleBySlug,
  useCreateProjectRole,
  useUpdateProjectRole,
  useDeleteProjectRole,
  useProjectTags: useGetWsTags,
  useProjectEnvironmentFolders: useListProjectEnvironmentsFolders,
  useAvailableAppConnections: useListAvailableAppConnections,
  useVaultNamespaces: useGetVaultNamespaces,
  useVaultPolicies: useGetVaultPolicies,
  useVaultMounts: useGetVaultMounts
};
