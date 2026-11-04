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
  useGetGroupById,
  useListGroupMembers,
  useListGroupProjects
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
  useGetIdentityProjectMemberships,
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
  useGetWorkspaceById,
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

import type { AccessAdapter } from "./contract";

export const accessLive: AccessAdapter = {
  useOrgPermission: useGetUserOrgPermissions,
  useProjectPermission: useGetUserProjectPermissions,
  useOrganization: useGetOrganizationById,
  useUpdateOrganization: useUpdateOrg,
  useProject: useGetWorkspaceById,

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
  useIdentityProjectMemberships: useGetIdentityProjectMemberships,
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
  useGroup: useGetGroupById,
  useGroupMembers: useListGroupMembers,
  useGroupProjects: useListGroupProjects,
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
