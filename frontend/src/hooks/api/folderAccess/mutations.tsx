import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { roleQueryKeys } from "@app/hooks/api/roles/queries";

import { IDENTITY_FOLDER_ACCESS_API, USER_FOLDER_ACCESS_API } from "./queries";
import {
  TCreateIdentityFolderAccessDTO,
  TCreateUserFolderAccessDTO,
  TDeleteIdentityFolderAccessDTO,
  TDeleteUserFolderAccessDTO,
  TFolderAccess,
  TUpdateIdentityFolderAccessDTO,
  TUpdateUserFolderAccessDTO
} from "./types";

type TFolderAccessScope = { projectId: string; folderId: string };

// a grant changes what the actor may read, so the roster and anything rendering the project's
// secrets both go stale. the roster is invalidated across every page/search variant.
const invalidateFolderAccess = (
  queryClient: ReturnType<typeof useQueryClient>,
  { projectId, folderId }: TFolderAccessScope
) => {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const label = query.queryKey[1];
      if (label !== "folder-access-users" && label !== "folder-access-identities") return false;
      const params = query.queryKey[0] as { projectId?: string; folderId?: string };
      return params?.projectId === projectId && params?.folderId === folderId;
    }
  });

  queryClient.invalidateQueries({
    predicate: (query) =>
      Array.isArray(query.queryKey) &&
      query.queryKey[0] === "dashboard" &&
      (query.queryKey[1] as { projectId?: string })?.projectId === projectId
  });

  queryClient.invalidateQueries({
    predicate: (query) =>
      (query.queryKey[0] as { projectId?: string })?.projectId === projectId &&
      query.queryKey[1] === "secrets"
  });

  queryClient.invalidateQueries({
    queryKey: roleQueryKeys.getUserProjectPermissions({ projectId })
  });
};

const userFolderAccessUrl = ({ projectId, userId, folderId }: TDeleteUserFolderAccessDTO) =>
  `${USER_FOLDER_ACCESS_API}/projects/${projectId}/users/${userId}/folder-access/${folderId}`;

const identityFolderAccessUrl = ({
  projectId,
  identityId,
  folderId
}: TDeleteIdentityFolderAccessDTO) =>
  `${IDENTITY_FOLDER_ACCESS_API}/projects/${projectId}/identities/${identityId}/folder-access/${folderId}`;

export const useCreateUserFolderAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ permission, type, ...target }: TCreateUserFolderAccessDTO) => {
      const { data } = await apiRequest.post<{ folderAccess: TFolderAccess & { userId: string } }>(
        userFolderAccessUrl(target),
        { permission, ...(type ? { type } : {}) }
      );
      return data.folderAccess;
    },
    onSuccess: (_, { projectId, folderId }) =>
      invalidateFolderAccess(queryClient, { projectId, folderId })
  });
};

export const useUpdateUserFolderAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ permission, type, ...target }: TUpdateUserFolderAccessDTO) => {
      const { data } = await apiRequest.patch<{ folderAccess: TFolderAccess & { userId: string } }>(
        userFolderAccessUrl(target),
        { ...(permission ? { permission } : {}), ...(type ? { type } : {}) }
      );
      return data.folderAccess;
    },
    onSuccess: (_, { projectId, folderId }) =>
      invalidateFolderAccess(queryClient, { projectId, folderId })
  });
};

export const useDeleteUserFolderAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (target: TDeleteUserFolderAccessDTO) => {
      const { data } = await apiRequest.delete<{
        folderAccess: TFolderAccess & { userId: string };
      }>(userFolderAccessUrl(target));
      return data.folderAccess;
    },
    onSuccess: (_, { projectId, folderId }) =>
      invalidateFolderAccess(queryClient, { projectId, folderId })
  });
};

export const useCreateIdentityFolderAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ permission, type, ...target }: TCreateIdentityFolderAccessDTO) => {
      const { data } = await apiRequest.post<{
        folderAccess: TFolderAccess & { identityId: string };
      }>(identityFolderAccessUrl(target), { permission, ...(type ? { type } : {}) });
      return data.folderAccess;
    },
    onSuccess: (_, { projectId, folderId }) =>
      invalidateFolderAccess(queryClient, { projectId, folderId })
  });
};

export const useUpdateIdentityFolderAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ permission, type, ...target }: TUpdateIdentityFolderAccessDTO) => {
      const { data } = await apiRequest.patch<{
        folderAccess: TFolderAccess & { identityId: string };
      }>(identityFolderAccessUrl(target), {
        ...(permission ? { permission } : {}),
        ...(type ? { type } : {})
      });
      return data.folderAccess;
    },
    onSuccess: (_, { projectId, folderId }) =>
      invalidateFolderAccess(queryClient, { projectId, folderId })
  });
};

export const useDeleteIdentityFolderAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (target: TDeleteIdentityFolderAccessDTO) => {
      const { data } = await apiRequest.delete<{
        folderAccess: TFolderAccess & { identityId: string };
      }>(identityFolderAccessUrl(target));
      return data.folderAccess;
    },
    onSuccess: (_, { projectId, folderId }) =>
      invalidateFolderAccess(queryClient, { projectId, folderId })
  });
};
