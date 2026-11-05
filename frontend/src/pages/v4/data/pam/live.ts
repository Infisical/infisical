import {
  useGetPamAccessCapabilities,
  useListPamAccounts,
  useListPamAccountTypes,
  useListPamFolders
} from "@app/hooks/api/pam";

import type { PamAdapter } from "./contract";

export const pamLive: PamAdapter = {
  useAccessCapabilities: useGetPamAccessCapabilities,
  useFolders: useListPamFolders,
  useAccounts: useListPamAccounts,
  useAccountTypes: useListPamAccountTypes
};
