import type {
  TPamAccessRequest,
  TPamAccount,
  useCreatePamAccount,
  useCreatePamFolder,
  useDeletePamAccount,
  useDeletePamFolder,
  useGrantPamFolderAdminAccess,
  usePamAccountActions,
  usePamFolderActions,
  useUpdatePamAccount,
  useUpdatePamFolder,
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
  useRevokePamAccessRequest,
  useUpdatePamProductGroupMember,
  useUpdatePamProductIdentityMember,
  useUpdatePamProductUserMember
} from "@app/hooks/api/pam";

import type { MutationOf } from "../access/contract";
import type { V4QueryResult } from "../contract";
import type { PamOperationsAdapter } from "./operations/contract";
import type { PamWebAccessAdapter } from "./web-access/contract";

export type TPamFoldersParams = NonNullable<Parameters<typeof useListPamFolders>[0]>;
export type TPamAccountsParams = NonNullable<Parameters<typeof useListPamAccounts>[0]>;
export type TPamAccessCapabilities = NonNullable<
  ReturnType<typeof useGetPamAccessCapabilities>["data"]
>;

type PamSubdomainAdapters = PamOperationsAdapter & PamWebAccessAdapter;

export type PamAdapter = PamSubdomainAdapters & {
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
  useAccount: (accountId?: string) => V4QueryResult<TPamAccount>;
  useFolderActions: (folderId: string, enabled?: boolean) => ReturnType<typeof usePamFolderActions>;
  useAccountActions: (
    accountId: string,
    enabled?: boolean
  ) => ReturnType<typeof usePamAccountActions>;
  useCreateFolder: MutationOf<typeof useCreatePamFolder>;
  useUpdateFolder: MutationOf<typeof useUpdatePamFolder>;
  useDeleteFolder: MutationOf<typeof useDeletePamFolder>;
  useGrantFolderAdminAccess: MutationOf<typeof useGrantPamFolderAdminAccess>;
  useCreateAccount: MutationOf<typeof useCreatePamAccount>;
  useUpdateAccount: MutationOf<typeof useUpdatePamAccount>;
  useDeleteAccount: MutationOf<typeof useDeletePamAccount>;
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
};
