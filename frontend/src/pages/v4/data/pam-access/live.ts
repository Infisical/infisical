import { useCallback, useEffect, useRef } from "react";

import { apiRequest } from "@app/config/request";
import { MfaSessionStatus, type TMfaSessionStatusResponse } from "@app/hooks/api/mfaSession";
import {
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
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import { pamAccessApprovalsLive } from "./approvals/live";
import type { PamAccessAdapter, TMfaChallengeOutcome } from "./contract";

const MFA_POLL_INTERVAL = 2000;
const MFA_TIMEOUT = 5 * 60 * 1000;

const useMfaChallenge = () => {
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelRef.current?.(), []);

  return useCallback(async (mfaSessionId: string): Promise<TMfaChallengeOutcome> => {
    const popup = window.open(`${window.location.origin}/mfa-session/${mfaSessionId}`, "_blank");
    if (!popup) return "blocked";
    const startedAt = Date.now();
    const verified = await new Promise<boolean>((resolve) => {
      const interval = setInterval(async () => {
        if (Date.now() - startedAt > MFA_TIMEOUT) {
          clearInterval(interval);
          resolve(false);
          return;
        }
        try {
          const { data } = await apiRequest.get<TMfaSessionStatusResponse>(
            `/api/v2/mfa-sessions/${mfaSessionId}/status`
          );
          if (data.status === MfaSessionStatus.ACTIVE) {
            clearInterval(interval);
            resolve(true);
          }
        } catch {
          clearInterval(interval);
          resolve(false);
        }
      }, MFA_POLL_INTERVAL);
      cancelRef.current = () => {
        clearInterval(interval);
        resolve(false);
      };
    });
    cancelRef.current = null;
    if (!popup.closed) popup.close();
    return verified ? "verified" : "failed";
  }, []);
};

export const pamAccessLive: PamAccessAdapter = {
  ...pamAccessApprovalsLive,
  useAccountMembers: useListAccountMembers,
  useFolderMembers: useListFolderMembers,
  useResourceRoles: useListPamResourceRoles,
  useProductGroups: useListPamProductGroups,
  useAddAccountUser: useAddAccountMember,
  useAddAccountGroup: useAddAccountGroupMember,
  useAddAccountIdentity: useAddAccountIdentityMember,
  useUpdateAccountUser: useUpdateAccountMemberRole,
  useUpdateAccountGroup: useUpdateAccountGroupMemberRole,
  useUpdateAccountIdentity: useUpdateAccountIdentityMemberRole,
  useRemoveAccountUser: useRemoveAccountMember,
  useRemoveAccountGroup: useRemoveAccountGroupMember,
  useRemoveAccountIdentity: useRemoveAccountIdentityMember,
  useAddFolderUser: useAddFolderMember,
  useAddFolderGroup: useAddFolderGroupMember,
  useAddFolderIdentity: useAddFolderIdentityMember,
  useUpdateFolderUser: useUpdateFolderMemberRole,
  useUpdateFolderGroup: useUpdateFolderGroupMemberRole,
  useUpdateFolderIdentity: useUpdateFolderIdentityMemberRole,
  useRemoveFolderUser: useRemoveFolderMember,
  useRemoveFolderGroup: useRemoveFolderGroupMember,
  useRemoveFolderIdentity: useRemoveFolderIdentityMember,
  useHeartbeat: useGetPamAccountHeartbeat,
  useCheckHeartbeat: useCheckPamAccountHeartbeat,
  useRotation: useGetPamAccountRotation,
  useRotationCandidates: useGetPamRotationCandidates,
  useUpdateRotation: useUpdatePamAccountRotation,
  useRotateNow: useRotatePamAccount,
  useDependencies: useListPamAccountDependencies,
  useRevealCredentials: usePamAccountCredentials,
  useMfaChallenge,
  useAccountApprovers: useGetPamAccountApprovers,
  useCreateAccessRequest: useCreatePamAccessRequest,
  useBreakGlass: useBreakGlassPamAccessRequest,
  useCancelAccessRequest: useCancelPamAccessRequest,
  useHasEnterpriseAlerting: (orgId) => {
    const { data, isPending, error } = useGetOrgSubscription({ orgID: orgId });
    return { data: data ? Boolean(data.pamEnterpriseAlerting) : undefined, isPending, error };
  }
};
