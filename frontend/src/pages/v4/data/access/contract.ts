import type { useListAvailableAppConnections } from "@app/hooks/api/appConnections/queries";
import type { useAssumeProjectPrivileges } from "@app/hooks/api/assumePrivileges/mutations";
import type {
  useAddIdentityToGroup,
  useAddUserToGroup,
  useCreateGroup,
  useDeleteGroup,
  useRemoveIdentityFromGroup,
  useRemoveUserFromGroup,
  useUpdateGroup
} from "@app/hooks/api/groups/mutations";
import type {
  useGetGroupById,
  useListGroupMembers,
  useListGroupProjects
} from "@app/hooks/api/groups/queries";
import type {
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
import type {
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
import type {
  useCreateIdentityAuthTemplate,
  useDeleteIdentityAuthTemplate,
  useUpdateIdentityAuthTemplate
} from "@app/hooks/api/identityAuthTemplates/mutations";
import type {
  useGetIdentityAuthTemplates,
  useGetTemplateUsages
} from "@app/hooks/api/identityAuthTemplates/queries";
import type {
  useGetVaultMounts,
  useGetVaultNamespaces,
  useGetVaultPolicies
} from "@app/hooks/api/migration/queries";
import type {
  useGetOrganizationById,
  useSearchOrganizationGroups,
  useUpdateOrg
} from "@app/hooks/api/organization/queries";
import type {
  useCreateOrgIdentity,
  useDeleteOrgIdentity,
  useUpdateOrgIdentity
} from "@app/hooks/api/orgIdentity/mutations";
import type { useUpdateProjectIdentity } from "@app/hooks/api/projectIdentity";
import type {
  useCreateProjectIdentity,
  useDeleteProjectIdentity
} from "@app/hooks/api/projectIdentity/mutations";
import type {
  useCreateProjectIdentityMembership,
  useDeleteProjectIdentityMembership,
  useUpdateProjectIdentityMembership
} from "@app/hooks/api/projectIdentityMembership/mutations";
import type {
  useGetProjectIdentityMembershipV2,
  useListProjectIdentityMemberships
} from "@app/hooks/api/projectIdentityMembership/queries";
import type {
  useAddGroupToWorkspace,
  useDeleteGroupFromWorkspace,
  useUpdateGroupWorkspaceRole
} from "@app/hooks/api/projects/mutations";
import type {
  useDeleteUserFromWorkspace,
  useGetAvailableProjectUsers,
  useGetWorkspaceById,
  useGetWorkspaceGroupMembershipDetails,
  useGetWorkspaceUserDetails,
  useGetWorkspaceUsers,
  useListWorkspaceGroups,
  useUpdateUserWorkspaceRole
} from "@app/hooks/api/projects/queries";
import type {
  useCreateOrgRole,
  useCreateProjectRole,
  useDeleteOrgRole,
  useDeleteProjectRole,
  useUpdateOrgRole,
  useUpdateProjectRole
} from "@app/hooks/api/roles/mutation";
import type {
  useGetOrgRole,
  useGetOrgRoles,
  useGetProjectRoleBySlug,
  useGetProjectRoles,
  useGetUserOrgPermissions,
  useGetUserProjectPermissions
} from "@app/hooks/api/roles/queries";
import type {
  useCreateServiceToken,
  useDeleteServiceToken,
  useGetUserWsServiceTokens
} from "@app/hooks/api/serviceTokens/queries";
import type { useGetWsTags } from "@app/hooks/api/tags/queries";
import type {
  useAddUserToWsNonE2EE,
  useResendOrgMemberInvitation
} from "@app/hooks/api/users/mutation";
import type {
  useAddUsersToOrg,
  useDeleteOrgMembership,
  useDeleteOrgMembershipBatch,
  useGetOrgMembership,
  useGetOrgMembershipProjectMemberships,
  useGetOrgUserAccess,
  useListUserGroupMemberships,
  useUpdateOrgMembership
} from "@app/hooks/api/users/queries";

import type { V4Mutation, V4QueryResult } from "../contract";

type QueryHook = (...args: never[]) => { data: unknown };
type MutationHook = () => { mutateAsync: (variables: never) => Promise<unknown> };

export type QueryOf<H extends QueryHook> = (
  ...args: Parameters<H>
) => V4QueryResult<NonNullable<ReturnType<H>["data"]>>;

export type MutationOf<H extends MutationHook> = V4Mutation<
  Parameters<ReturnType<H>["mutateAsync"]>[0],
  Awaited<ReturnType<ReturnType<H>["mutateAsync"]>>
>;

export type AccessAdapter = {
  useOrgPermission: QueryOf<typeof useGetUserOrgPermissions>;
  useProjectPermission: QueryOf<typeof useGetUserProjectPermissions>;
  useOrganization: QueryOf<typeof useGetOrganizationById>;
  useUpdateOrganization: MutationOf<typeof useUpdateOrg>;
  useProject: QueryOf<typeof useGetWorkspaceById>;

  useOrgUsers: QueryOf<typeof useGetOrgUserAccess>;
  useOrgMembership: QueryOf<typeof useGetOrgMembership>;
  useOrgMembershipProjectMemberships: QueryOf<typeof useGetOrgMembershipProjectMemberships>;
  useUserGroupMemberships: QueryOf<typeof useListUserGroupMemberships>;
  useInviteOrgUsers: MutationOf<typeof useAddUsersToOrg>;
  useUpdateOrgMembership: MutationOf<typeof useUpdateOrgMembership>;
  useDeleteOrgMembership: MutationOf<typeof useDeleteOrgMembership>;
  useDeleteOrgMemberships: MutationOf<typeof useDeleteOrgMembershipBatch>;
  useResendOrgInvite: MutationOf<typeof useResendOrgMemberInvitation>;

  useOrgRoles: QueryOf<typeof useGetOrgRoles>;
  useOrgRole: QueryOf<typeof useGetOrgRole>;
  useCreateOrgRole: MutationOf<typeof useCreateOrgRole>;
  useUpdateOrgRole: MutationOf<typeof useUpdateOrgRole>;
  useDeleteOrgRole: MutationOf<typeof useDeleteOrgRole>;

  useSearchOrgIdentities: QueryOf<typeof useSearchOrgIdentityMemberships>;
  useOrgIdentity: QueryOf<typeof useGetOrgIdentityMembershipById>;
  useIdentityProjectMemberships: QueryOf<typeof useGetIdentityProjectMemberships>;
  useCreateOrgIdentity: MutationOf<typeof useCreateOrgIdentity>;
  useUpdateOrgIdentity: MutationOf<typeof useUpdateOrgIdentity>;
  useDeleteOrgIdentity: MutationOf<typeof useDeleteOrgIdentity>;
  useIdentityUniversalAuth: QueryOf<typeof useGetIdentityUniversalAuth>;
  useIdentityUniversalAuthClientSecrets: QueryOf<typeof useGetIdentityUniversalAuthClientSecrets>;
  useAddIdentityUniversalAuth: MutationOf<typeof useAddIdentityUniversalAuth>;
  useUpdateIdentityUniversalAuth: MutationOf<typeof useUpdateIdentityUniversalAuth>;
  useDeleteIdentityUniversalAuth: MutationOf<typeof useDeleteIdentityUniversalAuth>;
  useCreateIdentityUniversalAuthClientSecret: MutationOf<
    typeof useCreateIdentityUniversalAuthClientSecret
  >;
  useRevokeIdentityUniversalAuthClientSecret: MutationOf<
    typeof useRevokeIdentityUniversalAuthClientSecret
  >;
  useClearIdentityUniversalAuthLockouts: MutationOf<typeof useClearIdentityUniversalAuthLockouts>;
  useIdentityAuthTemplates: QueryOf<typeof useGetIdentityAuthTemplates>;
  useIdentityAuthTemplateUsages: QueryOf<typeof useGetTemplateUsages>;
  useCreateIdentityAuthTemplate: MutationOf<typeof useCreateIdentityAuthTemplate>;
  useUpdateIdentityAuthTemplate: MutationOf<typeof useUpdateIdentityAuthTemplate>;
  useDeleteIdentityAuthTemplate: MutationOf<typeof useDeleteIdentityAuthTemplate>;
  useCountOrgIdentities: QueryOf<typeof useCountOrgIdentityMemberships>;
  useIdentityTokenAuth: QueryOf<typeof useGetIdentityTokenAuth>;
  useIdentityTokenAuthTokens: QueryOf<typeof useGetIdentityTokensTokenAuth>;
  useCreateIdentityTokenAuthToken: MutationOf<typeof useCreateTokenIdentityTokenAuth>;
  useRevokeIdentityTokenAuthToken: MutationOf<typeof useRevokeIdentityTokenAuthToken>;
  useDeleteIdentityTokenAuth: MutationOf<typeof useDeleteIdentityTokenAuth>;
  useIdentityKubernetesAuth: QueryOf<typeof useGetIdentityKubernetesAuth>;
  useDeleteIdentityKubernetesAuth: MutationOf<typeof useDeleteIdentityKubernetesAuth>;
  useIdentityAwsAuth: QueryOf<typeof useGetIdentityAwsAuth>;
  useDeleteIdentityAwsAuth: MutationOf<typeof useDeleteIdentityAwsAuth>;
  useIdentityOidcAuth: QueryOf<typeof useGetIdentityOidcAuth>;
  useDeleteIdentityOidcAuth: MutationOf<typeof useDeleteIdentityOidcAuth>;

  useOrgGroups: QueryOf<typeof useSearchOrganizationGroups>;
  useGroup: QueryOf<typeof useGetGroupById>;
  useGroupMembers: QueryOf<typeof useListGroupMembers>;
  useGroupProjects: QueryOf<typeof useListGroupProjects>;
  useCreateGroup: MutationOf<typeof useCreateGroup>;
  useUpdateGroup: MutationOf<typeof useUpdateGroup>;
  useDeleteGroup: MutationOf<typeof useDeleteGroup>;
  useAddUserToGroup: MutationOf<typeof useAddUserToGroup>;
  useRemoveUserFromGroup: MutationOf<typeof useRemoveUserFromGroup>;
  useAddIdentityToGroup: MutationOf<typeof useAddIdentityToGroup>;
  useRemoveIdentityFromGroup: MutationOf<typeof useRemoveIdentityFromGroup>;

  useProjectUsers: QueryOf<typeof useGetWorkspaceUsers>;
  useProjectUser: QueryOf<typeof useGetWorkspaceUserDetails>;
  useAvailableProjectUsers: QueryOf<typeof useGetAvailableProjectUsers>;
  useAddProjectUsers: MutationOf<typeof useAddUserToWsNonE2EE>;
  useUpdateProjectUserRoles: MutationOf<typeof useUpdateUserWorkspaceRole>;
  useRemoveProjectUsers: MutationOf<typeof useDeleteUserFromWorkspace>;
  useAssumeProjectPrivileges: MutationOf<typeof useAssumeProjectPrivileges>;

  useProjectIdentities: QueryOf<typeof useListProjectIdentityMemberships>;
  useProjectIdentity: QueryOf<typeof useGetProjectIdentityMembershipV2>;
  useAddProjectIdentity: MutationOf<typeof useCreateProjectIdentityMembership>;
  useUpdateProjectIdentityRoles: MutationOf<typeof useUpdateProjectIdentityMembership>;
  useRemoveProjectIdentity: MutationOf<typeof useDeleteProjectIdentityMembership>;
  useCreateProjectManagedIdentity: MutationOf<typeof useCreateProjectIdentity>;
  useDeleteProjectManagedIdentity: MutationOf<typeof useDeleteProjectIdentity>;
  useUpdateProjectManagedIdentity: MutationOf<typeof useUpdateProjectIdentity>;

  useProjectGroups: QueryOf<typeof useListWorkspaceGroups>;
  useProjectGroup: QueryOf<typeof useGetWorkspaceGroupMembershipDetails>;
  useAddProjectGroup: MutationOf<typeof useAddGroupToWorkspace>;
  useUpdateProjectGroupRoles: MutationOf<typeof useUpdateGroupWorkspaceRole>;
  useRemoveProjectGroup: MutationOf<typeof useDeleteGroupFromWorkspace>;

  useServiceTokens: QueryOf<typeof useGetUserWsServiceTokens>;
  useCreateServiceToken: MutationOf<typeof useCreateServiceToken>;
  useDeleteServiceToken: MutationOf<typeof useDeleteServiceToken>;

  useProjectRoles: QueryOf<typeof useGetProjectRoles>;
  useProjectRole: QueryOf<typeof useGetProjectRoleBySlug>;
  useCreateProjectRole: MutationOf<typeof useCreateProjectRole>;
  useUpdateProjectRole: MutationOf<typeof useUpdateProjectRole>;
  useDeleteProjectRole: MutationOf<typeof useDeleteProjectRole>;
  useProjectTags: QueryOf<typeof useGetWsTags>;
  useAvailableAppConnections: QueryOf<typeof useListAvailableAppConnections>;
  useVaultNamespaces: QueryOf<typeof useGetVaultNamespaces>;
  useVaultPolicies: QueryOf<typeof useGetVaultPolicies>;
  useVaultMounts: QueryOf<typeof useGetVaultMounts>;
};
