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
  useRemovePamProductGroupMember,
  useRemovePamProductIdentityMember,
  useRemovePamProductUserMember,
  useReviewPamAccessRequest,
  useListPamSessions,
  usePamAccountPermission,
  useRevokePamAccessRequest,
  useTerminatePamSession,
  useUpdatePamProductGroupMember,
  useUpdatePamProductIdentityMember,
  useUpdatePamProductUserMember
} from "@app/hooks/api/pam";

import type { MutationOf } from "../access/contract";
import type { V4QueryResult } from "../contract";

export type TPamFoldersParams = NonNullable<Parameters<typeof useListPamFolders>[0]>;
export type TPamAccountsParams = NonNullable<Parameters<typeof useListPamAccounts>[0]>;
export type TPamAccessCapabilities = NonNullable<
  ReturnType<typeof useGetPamAccessCapabilities>["data"]
>;

export type TPamSessionsParams = NonNullable<Parameters<typeof useListPamSessions>[1]>;
export type TPamSessionList = NonNullable<ReturnType<typeof useListPamSessions>["data"]>;
export type TPamAccountPermission = NonNullable<ReturnType<typeof usePamAccountPermission>["data"]>;

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
  useSessions: (projectId: string, params?: TPamSessionsParams) => V4QueryResult<TPamSessionList>;
  useAccountPermission: (
    accountId: string,
    enabled?: boolean
  ) => V4QueryResult<TPamAccountPermission>;
  useTerminateSession: MutationOf<typeof useTerminatePamSession>;
};
