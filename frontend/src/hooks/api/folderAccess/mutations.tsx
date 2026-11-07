import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { roleQueryKeys } from "@app/hooks/api/roles/queries";

import {
  TCreateIdentityFolderAccessDTO,
  TCreateUserFolderAccessDTO,
  TDeleteIdentityFolderAccessDTO,
  TDeleteUserFolderAccessDTO,
  TFolderAccess,
  TUpdateIdentityFolderAccessDTO,
  TUpdateUserFolderAccessDTO
} from "./types";

// a grant changes what the actor may read, so the roster and anything rendering the project's
// secrets both go stale. the roster is invalidated across every page/search variant.
const invalidateFolderAccess = (
  queryClient: ReturnType<typeof useQueryClient>,
  { projectId }: { projectId: string }
) => {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const label = query.queryKey[1];
      return (
        (label === "user-folder-access" ||
          label === "identity-folder-access" ||
          label === "folder-access-users" ||
          label === "folder-access-identities") &&
        (query.queryKey[0] as { projectId?: string })?.projectId === projectId
      );
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

const userFolderAccessUrl = ({ projectId, userId }: { projectId: string; userId: string }) =>
  `/api/v1/projects/${projectId}/users/${userId}/secret-folder-access`;

const identityFolderAccessUrl = ({
  projectId,
  identityId
}: {
  projectId: string;
  identityId: string;
}) => `/api/v1/projects/${projectId}/memberships/identities/${identityId}/secret-folder-access`;

export const useCreateUserFolderAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      userId,
      environmentSlug,
      secretPath,
      permission,
      isRecursive,
      type
    }: TCreateUserFolderAccessDTO) => {
      const { data } = await apiRequest.post<{ folderAccess: TFolderAccess & { userId: string } }>(
        userFolderAccessUrl({ projectId, userId }),
        {
          environmentSlug,
          secretPath,
          permission,
          ...(isRecursive === undefined ? {} : { isRecursive }),
          ...(type ? { type } : {})
        }
      );
      return data.folderAccess;
    },
    onSuccess: (_, { projectId }) => invalidateFolderAccess(queryClient, { projectId })
  });
};

export const useUpdateUserFolderAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      userId,
      environmentSlug,
      secretPath,
      permission,
      isRecursive,
      type
    }: TUpdateUserFolderAccessDTO) => {
      const { data } = await apiRequest.patch<{ folderAccess: TFolderAccess & { userId: string } }>(
        userFolderAccessUrl({ projectId, userId }),
        {
          environmentSlug,
          secretPath,
          ...(permission ? { permission } : {}),
          ...(isRecursive === undefined ? {} : { isRecursive }),
          ...(type ? { type } : {})
        }
      );
      return data.folderAccess;
    },
    onSuccess: (_, { projectId }) => invalidateFolderAccess(queryClient, { projectId })
  });
};

export const useDeleteUserFolderAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      userId,
      environmentSlug,
      secretPath
    }: TDeleteUserFolderAccessDTO) => {
      const { data } = await apiRequest.delete<{
        folderAccess: TFolderAccess & { userId: string };
      }>(userFolderAccessUrl({ projectId, userId }), {
        data: { environmentSlug, secretPath }
      });
      return data.folderAccess;
    },
    onSuccess: (_, { projectId }) => invalidateFolderAccess(queryClient, { projectId })
  });
};

export const useCreateIdentityFolderAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      identityId,
      environmentSlug,
      secretPath,
      permission,
      isRecursive,
      type
    }: TCreateIdentityFolderAccessDTO) => {
      const { data } = await apiRequest.post<{
        folderAccess: TFolderAccess & { identityId: string };
      }>(identityFolderAccessUrl({ projectId, identityId }), {
        environmentSlug,
        secretPath,
        permission,
        ...(isRecursive === undefined ? {} : { isRecursive }),
        ...(type ? { type } : {})
      });
      return data.folderAccess;
    },
    onSuccess: (_, { projectId }) => invalidateFolderAccess(queryClient, { projectId })
  });
};

export const useUpdateIdentityFolderAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      identityId,
      environmentSlug,
      secretPath,
      permission,
      isRecursive,
      type
    }: TUpdateIdentityFolderAccessDTO) => {
      const { data } = await apiRequest.patch<{
        folderAccess: TFolderAccess & { identityId: string };
      }>(identityFolderAccessUrl({ projectId, identityId }), {
        environmentSlug,
        secretPath,
        ...(permission ? { permission } : {}),
        ...(isRecursive === undefined ? {} : { isRecursive }),
        ...(type ? { type } : {})
      });
      return data.folderAccess;
    },
    onSuccess: (_, { projectId }) => invalidateFolderAccess(queryClient, { projectId })
  });
};

export const useDeleteIdentityFolderAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      identityId,
      environmentSlug,
      secretPath
    }: TDeleteIdentityFolderAccessDTO) => {
      const { data } = await apiRequest.delete<{
        folderAccess: TFolderAccess & { identityId: string };
      }>(identityFolderAccessUrl({ projectId, identityId }), {
        data: { environmentSlug, secretPath }
      });
      return data.folderAccess;
    },
    onSuccess: (_, { projectId }) => invalidateFolderAccess(queryClient, { projectId })
  });
};
