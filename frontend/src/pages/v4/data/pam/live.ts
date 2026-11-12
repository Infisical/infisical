import {
  useAddPamProductGroupMember,
  useAddPamProductIdentityMember,
  useAddPamProductUserMember,
  useGetPamAccessCapabilities,
  useListPamAccounts,
  useListPamAccountTypes,
  useListPamFolders,
  useListPamPendingMyApproval,
  useListPamProductIdentities,
  useRemovePamProductGroupMember,
  useRemovePamProductIdentityMember,
  useRemovePamProductUserMember,
  useReviewPamAccessRequest,
  useRevokePamAccessRequest,
  useUpdatePamProductGroupMember,
  useUpdatePamProductIdentityMember,
  useUpdatePamProductUserMember
} from "@app/hooks/api/pam";

import type { PamAdapter } from "./contract";

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
  useRevokeAccessRequest: useRevokePamAccessRequest
};
