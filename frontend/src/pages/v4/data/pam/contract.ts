import type {
  TPamAccessRequest,
  TPamAccountListItem,
  TPamAccountTypeMetadata,
  TPamFolderWithCount,
  TPamIdentityMember,
  useAddPamProductGroupMember,
  useAddPamProductIdentityMember,
  useAddPamProductUserMember,
  useGetPamAccessCapabilities,
  useListPamAccounts,
  useListPamFolders,
  useListPamSessions,
  usePamAccountActions,
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

import type { MutationOf, QueryOf } from "../access/contract";
import type { V4QueryResult } from "../contract";

export type TPamFoldersParams = NonNullable<Parameters<typeof useListPamFolders>[0]>;
export type TPamAccountsParams = NonNullable<Parameters<typeof useListPamAccounts>[0]>;
export type TPamAccessCapabilities = NonNullable<
  ReturnType<typeof useGetPamAccessCapabilities>["data"]
>;

export type PamAdapter = {
  useAccessCapabilities: () => V4QueryResult<TPamAccessCapabilities>;
  useFolders: (
    params?: TPamFoldersParams,
    options?: { enabled?: boolean }
  ) => V4QueryResult<TPamFolderWithCount[]>;
  useAccounts: (
    params?: TPamAccountsParams,
    options?: { enabled?: boolean }
  ) => V4QueryResult<TPamAccountListItem[]>;
  useAccountTypes: () => V4QueryResult<TPamAccountTypeMetadata[]>;
  useProductIdentities: () => V4QueryResult<TPamIdentityMember[]>;
  useAddProductUserMember: MutationOf<typeof useAddPamProductUserMember>;
  useUpdateProductUserMember: MutationOf<typeof useUpdatePamProductUserMember>;
  useRemoveProductUserMember: MutationOf<typeof useRemovePamProductUserMember>;
  useAddProductGroupMember: MutationOf<typeof useAddPamProductGroupMember>;
  useUpdateProductGroupMember: MutationOf<typeof useUpdatePamProductGroupMember>;
  useRemoveProductGroupMember: MutationOf<typeof useRemovePamProductGroupMember>;
  useAddProductIdentityMember: MutationOf<typeof useAddPamProductIdentityMember>;
  useUpdateProductIdentityMember: MutationOf<typeof useUpdatePamProductIdentityMember>;
  useRemoveProductIdentityMember: MutationOf<typeof useRemovePamProductIdentityMember>;
  usePendingMyApproval: () => V4QueryResult<TPamAccessRequest[]>;
  useReviewAccessRequest: MutationOf<typeof useReviewPamAccessRequest>;
  useRevokeAccessRequest: MutationOf<typeof useRevokePamAccessRequest>;
  useSessions: QueryOf<typeof useListPamSessions>;
  useAccountActions: typeof usePamAccountActions;
  useTerminateSession: MutationOf<typeof useTerminatePamSession>;
};
