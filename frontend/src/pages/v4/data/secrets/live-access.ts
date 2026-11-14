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
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import type { SecretsAccessAdapter } from "./contract-access";

export const secretsAccessLive: SecretsAccessAdapter = {
  useHasFolderAccessPlan: (orgId) => {
    const { data, isPending, error } = useGetOrgSubscription({ orgID: orgId });
    return { data: data ? Boolean(data.secretsFolderRbac) : undefined, isPending, error };
  },
  useFolderAccessUsers: useListFolderAccessUsers,
  useFolderAccessIdentities: useListFolderAccessIdentities,
  useCreateUserFolderAccess,
  useUpdateUserFolderAccess,
  useDeleteUserFolderAccess,
  useCreateIdentityFolderAccess,
  useUpdateIdentityFolderAccess,
  useDeleteIdentityFolderAccess
};
