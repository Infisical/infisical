import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

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
import {
  groupByIdQuery,
  groupProjectsQuery,
  useListGroupMembers
} from "@app/hooks/api/groups/queries";
import {
  useAddIdentityUniversalAuth,
  useClearIdentityUniversalAuthLockouts,
  useCreateIdentityUniversalAuthClientSecret,
  useCreateTokenIdentityTokenAuth,
  useDeleteIdentityAwsAuth,
  useDeleteIdentityKubernetesAuth,
  useDeleteIdentityOidcAuth,
  useDeleteIdentityTokenAuth,
  useDeleteIdentityUniversalAuth,
  useRevokeIdentityTokenAuthToken,
  useRevokeIdentityUniversalAuthClientSecret,
  useUpdateIdentityUniversalAuth
} from "@app/hooks/api/identities/mutations";
import {
  useCountOrgIdentityMemberships,
  useGetIdentityAwsAuth,
  useGetIdentityKubernetesAuth,
  useGetIdentityOidcAuth,
  useGetIdentityTokenAuth,
  useGetIdentityTokensTokenAuth,
  useGetIdentityUniversalAuth,
  useGetIdentityUniversalAuthClientSecrets,
  useGetOrgIdentityMembershipById,
  identityProjectMembershipsQuery,
  useSearchOrgIdentityMemberships
} from "@app/hooks/api/identities/queries";
import {
  useCreateIdentityAuthTemplate,
  useDeleteIdentityAuthTemplate,
  useUpdateIdentityAuthTemplate
} from "@app/hooks/api/identityAuthTemplates/mutations";
import {
  useGetIdentityAuthTemplates,
  useGetTemplateUsages
} from "@app/hooks/api/identityAuthTemplates/queries";
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
  useGetAvailableProjectUsers,
  useGetWorkspaceGroupMembershipDetails,
  useGetWorkspaceUserDetails,
  useGetWorkspaceUsers,
  useListWorkspaceGroups,
  useUpdateUserWorkspaceRole
} from "@app/hooks/api/projects/queries";
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

import { useProjectById } from "../projectQuery";
import type { AccessAdapter } from "./contract";

const useOrgId = () => useParams({ from: "/v4/organizations/$orgId" }).orgId;

export const accessLive: AccessAdapter = {
  useOrgPermission: useGetUserOrgPermissions,
  useProjectPermission: useGetUserProjectPermissions,
  useOrganization: useGetOrganizationById,
  useUpdateOrganization: useUpdateOrg,
  useProject: useProjectById,

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
  useAddIdentityUniversalAuth,
  useUpdateIdentityUniversalAuth,
  useDeleteIdentityUniversalAuth,
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
  useDeleteIdentityTokenAuth,
  useIdentityKubernetesAuth: useGetIdentityKubernetesAuth,
  useDeleteIdentityKubernetesAuth,
  useIdentityAwsAuth: useGetIdentityAwsAuth,
  useDeleteIdentityAwsAuth,
  useIdentityOidcAuth: useGetIdentityOidcAuth,
  useDeleteIdentityOidcAuth,

  useOrgGroups: useSearchOrganizationGroups,
  useGroup: (groupId) => useQuery(groupByIdQuery(useOrgId(), groupId)),
  useGroupMembers: useListGroupMembers,
  useGroupProjects: (dto) => useQuery(groupProjectsQuery(useOrgId(), dto)),
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
  useAvailableAppConnections: useListAvailableAppConnections,
  useVaultNamespaces: useGetVaultNamespaces,
  useVaultPolicies: useGetVaultPolicies,
  useVaultMounts: useGetVaultMounts
};
