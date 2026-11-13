import { useParams } from "@tanstack/react-router";

import {
  usePamAccountActions,
  useAddPamProductGroupMember,
  useAddPamProductIdentityMember,
  useAddPamProductUserMember,
  useGetPamAccessCapabilities,
  useListPamAccounts,
  useListPamAccountTypes,
  useListPamFolders,
  useListPamPendingMyApproval,
  useListPamProductIdentities,
  useListPamSessions,
  useRemovePamProductGroupMember,
  useRemovePamProductIdentityMember,
  useRemovePamProductUserMember,
  useReviewPamAccessRequest,
  useRevokePamAccessRequest,
  useTerminatePamSession,
  useUpdatePamProductGroupMember,
  useUpdatePamProductIdentityMember,
  useUpdatePamProductUserMember
} from "@app/hooks/api/pam";

import type { PamAdapter } from "./contract";

// The server resolves the PAM project from the org, so main's projectId argument only keys the cache.
const useOrgId = () => useParams({ from: "/v4/organizations/$orgId" }).orgId;

export const pamLive: PamAdapter = {
  useAccessCapabilities: useGetPamAccessCapabilities,
  useFolders: useListPamFolders,
  useAccounts: useListPamAccounts,
  useAccountTypes: useListPamAccountTypes,
  useProductIdentities: useListPamProductIdentities,
  useAddProductUserMember: useAddPamProductUserMember,
  useUpdateProductUserMember: useUpdatePamProductUserMember,
  useRemoveProductUserMember: useRemovePamProductUserMember,
  useAddProductGroupMember: useAddPamProductGroupMember,
  useUpdateProductGroupMember: useUpdatePamProductGroupMember,
  useRemoveProductGroupMember: useRemovePamProductGroupMember,
  useAddProductIdentityMember: useAddPamProductIdentityMember,
  useUpdateProductIdentityMember: useUpdatePamProductIdentityMember,
  useRemoveProductIdentityMember: useRemovePamProductIdentityMember,
  usePendingMyApproval: () => useListPamPendingMyApproval(),
  useReviewAccessRequest: useReviewPamAccessRequest,
  useRevokeAccessRequest: useRevokePamAccessRequest,
  useSessions: (params) => useListPamSessions(useOrgId(), params),
  useTerminateSession: () => {
    const orgId = useOrgId();
    const terminate = useTerminatePamSession();
    return {
      isPending: terminate.isPending,
      mutateAsync: ({ sessionId }) => terminate.mutateAsync({ sessionId, projectId: orgId })
    };
  },
  useAccountActions: usePamAccountActions
};
