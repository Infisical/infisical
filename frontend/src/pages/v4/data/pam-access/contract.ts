import type {
  useAddAccountGroupMember,
  useAddAccountIdentityMember,
  useAddAccountMember,
  useAddFolderGroupMember,
  useAddFolderIdentityMember,
  useAddFolderMember,
  useBreakGlassPamAccessRequest,
  useCancelPamAccessRequest,
  useCheckPamAccountHeartbeat,
  useCreatePamAccessRequest,
  useGetPamAccountApprovers,
  useGetPamAccountHeartbeat,
  useGetPamAccountRotation,
  useGetPamRotationCandidates,
  useListAccountMembers,
  useListFolderMembers,
  useListPamAccountDependencies,
  useListPamProductGroups,
  useListPamResourceRoles,
  usePamAccountCredentials,
  useRemoveAccountGroupMember,
  useRemoveAccountIdentityMember,
  useRemoveAccountMember,
  useRemoveFolderGroupMember,
  useRemoveFolderIdentityMember,
  useRemoveFolderMember,
  useRotatePamAccount,
  useUpdateAccountGroupMemberRole,
  useUpdateAccountIdentityMemberRole,
  useUpdateAccountMemberRole,
  useUpdateFolderGroupMemberRole,
  useUpdateFolderIdentityMemberRole,
  useUpdateFolderMemberRole,
  useUpdatePamAccountRotation
} from "@app/hooks/api/pam";

import type { MutationOf, QueryOf } from "../access/contract";
import type { V4QueryResult } from "../contract";
import type { PamAccessApprovalsAdapter } from "./approvals/contract";

export type TMfaChallengeOutcome = "verified" | "blocked" | "failed";

export type PamAccessAdapter = PamAccessApprovalsAdapter & {
  useAccountMembers: QueryOf<typeof useListAccountMembers>;
  useFolderMembers: QueryOf<typeof useListFolderMembers>;
  useResourceRoles: QueryOf<typeof useListPamResourceRoles>;
  useProductGroups: QueryOf<typeof useListPamProductGroups>;
  useAddAccountUser: MutationOf<typeof useAddAccountMember>;
  useAddAccountGroup: MutationOf<typeof useAddAccountGroupMember>;
  useAddAccountIdentity: MutationOf<typeof useAddAccountIdentityMember>;
  useUpdateAccountUser: MutationOf<typeof useUpdateAccountMemberRole>;
  useUpdateAccountGroup: MutationOf<typeof useUpdateAccountGroupMemberRole>;
  useUpdateAccountIdentity: MutationOf<typeof useUpdateAccountIdentityMemberRole>;
  useRemoveAccountUser: MutationOf<typeof useRemoveAccountMember>;
  useRemoveAccountGroup: MutationOf<typeof useRemoveAccountGroupMember>;
  useRemoveAccountIdentity: MutationOf<typeof useRemoveAccountIdentityMember>;
  useAddFolderUser: MutationOf<typeof useAddFolderMember>;
  useAddFolderGroup: MutationOf<typeof useAddFolderGroupMember>;
  useAddFolderIdentity: MutationOf<typeof useAddFolderIdentityMember>;
  useUpdateFolderUser: MutationOf<typeof useUpdateFolderMemberRole>;
  useUpdateFolderGroup: MutationOf<typeof useUpdateFolderGroupMemberRole>;
  useUpdateFolderIdentity: MutationOf<typeof useUpdateFolderIdentityMemberRole>;
  useRemoveFolderUser: MutationOf<typeof useRemoveFolderMember>;
  useRemoveFolderGroup: MutationOf<typeof useRemoveFolderGroupMember>;
  useRemoveFolderIdentity: MutationOf<typeof useRemoveFolderIdentityMember>;

  useHeartbeat: QueryOf<typeof useGetPamAccountHeartbeat>;
  useCheckHeartbeat: MutationOf<typeof useCheckPamAccountHeartbeat>;
  useRotation: QueryOf<typeof useGetPamAccountRotation>;
  useRotationCandidates: QueryOf<typeof useGetPamRotationCandidates>;
  useUpdateRotation: MutationOf<typeof useUpdatePamAccountRotation>;
  useRotateNow: MutationOf<typeof useRotatePamAccount>;
  useDependencies: QueryOf<typeof useListPamAccountDependencies>;

  useRevealCredentials: MutationOf<typeof usePamAccountCredentials>;
  useMfaChallenge: () => (mfaSessionId: string) => Promise<TMfaChallengeOutcome>;
  useAccountApprovers: QueryOf<typeof useGetPamAccountApprovers>;
  useCreateAccessRequest: MutationOf<typeof useCreatePamAccessRequest>;
  useBreakGlass: MutationOf<typeof useBreakGlassPamAccessRequest>;
  useCancelAccessRequest: MutationOf<typeof useCancelPamAccessRequest>;
  useHasEnterpriseAlerting: (orgId: string) => V4QueryResult<boolean>;
};
