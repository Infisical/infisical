import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TFolderAccessIdentity, TFolderAccessUser, TListFolderAccessActorsDTO } from "./types";

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
    ] as const
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
      const { data } = await apiRequest.get<{ users: TFolderAccessUser[]; totalCount: number }>(
        `/api/v1/projects/${projectId}/secret-folder-access/users`,
        {
          params: { environmentSlug, secretPath, offset, limit, ...(search ? { search } : {}) }
        }
      );
      return data;
    },
    enabled: Boolean(projectId) && Boolean(environmentSlug) && Boolean(secretPath)
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
      const { data } = await apiRequest.get<{
        identities: TFolderAccessIdentity[];
        totalCount: number;
      }>(`/api/v1/projects/${projectId}/memberships/secret-folder-access/identities`, {
        params: { environmentSlug, secretPath, offset, limit, ...(search ? { search } : {}) }
      });
      return data;
    },
    enabled: Boolean(projectId) && Boolean(environmentSlug) && Boolean(secretPath)
  });
