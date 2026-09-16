import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TIdentityFolderAccess,
  TListFolderAccessActorsDTO,
  TListFolderAccessIdentitiesResponse,
  TListFolderAccessUsersResponse,
  TListIdentityFolderAccessDTO,
  TListUserFolderAccessDTO,
  TUserFolderAccess
} from "./types";

const DEFAULT_LIMIT = 50;

export const folderAccessKeys = {
  listUsers: ({
    projectId,
    environmentSlug,
    secretPath,
    offset,
    limit,
    search
  }: TListFolderAccessActorsDTO) =>
    [
      { projectId, environmentSlug, secretPath, offset, limit, search },
      "folder-access-users"
    ] as const,
  listIdentities: ({
    projectId,
    environmentSlug,
    secretPath,
    offset,
    limit,
    search
  }: TListFolderAccessActorsDTO) =>
    [
      { projectId, environmentSlug, secretPath, offset, limit, search },
      "folder-access-identities"
    ] as const,
  listUserGrants: ({ projectId, userId }: TListUserFolderAccessDTO) =>
    [{ projectId, userId }, "user-folder-access"] as const,
  listIdentityGrants: ({ projectId, identityId }: TListIdentityFolderAccessDTO) =>
    [{ projectId, identityId }, "identity-folder-access"] as const
};

export const useListFolderAccessUsers = ({
  projectId,
  environmentSlug,
  secretPath,
  offset = 0,
  limit = DEFAULT_LIMIT,
  search
}: TListFolderAccessActorsDTO) =>
  useQuery({
    queryKey: folderAccessKeys.listUsers({
      projectId,
      environmentSlug,
      secretPath,
      offset,
      limit,
      search
    }),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListFolderAccessUsersResponse>(
        `/api/v1/projects/${projectId}/secret-folder-access/users`,
        {
          params: { environmentSlug, secretPath, offset, limit, ...(search ? { search } : {}) }
        }
      );
      return data;
    },
    enabled: Boolean(projectId) && Boolean(environmentSlug) && Boolean(secretPath)
  });

export const useListUserFolderAccess = ({ projectId, userId }: TListUserFolderAccessDTO) =>
  useQuery({
    queryKey: folderAccessKeys.listUserGrants({ projectId, userId }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ folderAccess: TUserFolderAccess[] }>(
        `/api/v1/projects/${projectId}/users/${userId}/secret-folder-access`
      );
      return data.folderAccess;
    },
    enabled: Boolean(projectId) && Boolean(userId)
  });

export const useListIdentityFolderAccess = ({
  projectId,
  identityId
}: TListIdentityFolderAccessDTO) =>
  useQuery({
    queryKey: folderAccessKeys.listIdentityGrants({ projectId, identityId }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ folderAccess: TIdentityFolderAccess[] }>(
        `/api/v1/projects/${projectId}/memberships/identities/${identityId}/secret-folder-access`
      );
      return data.folderAccess;
    },
    enabled: Boolean(projectId) && Boolean(identityId)
  });

export const useListFolderAccessIdentities = ({
  projectId,
  environmentSlug,
  secretPath,
  offset = 0,
  limit = DEFAULT_LIMIT,
  search
}: TListFolderAccessActorsDTO) =>
  useQuery({
    queryKey: folderAccessKeys.listIdentities({
      projectId,
      environmentSlug,
      secretPath,
      offset,
      limit,
      search
    }),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListFolderAccessIdentitiesResponse>(
        `/api/v1/projects/${projectId}/memberships/secret-folder-access/identities`,
        {
          params: { environmentSlug, secretPath, offset, limit, ...(search ? { search } : {}) }
        }
      );
      return data;
    },
    enabled: Boolean(projectId) && Boolean(environmentSlug) && Boolean(secretPath)
  });
