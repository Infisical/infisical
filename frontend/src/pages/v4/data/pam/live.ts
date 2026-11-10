import {
  useAddPamProductGroupMember,
  useAddPamProductIdentityMember,
  useAddPamProductUserMember,
  useGetPamAccessCapabilities,
  useListPamAccounts,
  useListPamAccountTypes,
  useListPamFolders,
  useListPamProductIdentities,
  useRemovePamProductGroupMember,
  useRemovePamProductIdentityMember,
  useRemovePamProductUserMember,
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
  useRemoveProductIdentityMember: useRemovePamProductIdentityMember
};
