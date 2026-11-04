import {
  useCreateIdentityFolderAccess,
  useCreateUserFolderAccess,
  useDeleteIdentityFolderAccess,
  useDeleteUserFolderAccess,
  useUpdateIdentityFolderAccess,
  useUpdateUserFolderAccess
} from "@app/hooks/api/folderAccess/mutations";
import {
  useListFolderAccessIdentities,
  useListFolderAccessUsers
} from "@app/hooks/api/folderAccess/queries";

import type { SecretsAccessAdapter } from "./contract-access";

export const secretsAccessLive: SecretsAccessAdapter = {
  useFolderAccessUsers: useListFolderAccessUsers,
  useFolderAccessIdentities: useListFolderAccessIdentities,
  useCreateUserFolderAccess,
  useUpdateUserFolderAccess,
  useDeleteUserFolderAccess,
  useCreateIdentityFolderAccess,
  useUpdateIdentityFolderAccess,
  useDeleteIdentityFolderAccess
};
