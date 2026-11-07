import type {
  TPamAccountListItem,
  TPamAccountTypeMetadata,
  TPamFolderWithCount,
  useGetPamAccessCapabilities,
  useListPamAccounts,
  useListPamFolders
} from "@app/hooks/api/pam";

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
};
