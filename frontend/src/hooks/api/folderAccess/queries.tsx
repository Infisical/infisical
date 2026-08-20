import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TFolderAccessIdentity, TFolderAccessUser, TListFolderAccessActorsDTO } from "./types";

export const USER_FOLDER_ACCESS_API = "/api/v1/user-project-additional-privilege";
export const IDENTITY_FOLDER_ACCESS_API = "/api/v2/identity-project-additional-privilege";

const DEFAULT_LIMIT = 50;

export const folderAccessKeys = {
  listUsers: ({ projectId, folderId, offset, limit, search }: TListFolderAccessActorsDTO) =>
    [{ projectId, folderId, offset, limit, search }, "folder-access-users"] as const,
  listIdentities: ({ projectId, folderId, offset, limit, search }: TListFolderAccessActorsDTO) =>
    [{ projectId, folderId, offset, limit, search }, "folder-access-identities"] as const
};

export const useListFolderAccessUsers = ({
  projectId,
  folderId,
  offset = 0,
  limit = DEFAULT_LIMIT,
  search
}: TListFolderAccessActorsDTO) =>
  useQuery({
    queryKey: folderAccessKeys.listUsers({ projectId, folderId, offset, limit, search }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ users: TFolderAccessUser[]; totalCount: number }>(
        `${USER_FOLDER_ACCESS_API}/projects/${projectId}/folder-access/${folderId}/users`,
        { params: { offset, limit, ...(search ? { search } : {}) } }
      );
      return data;
    },
    enabled: Boolean(projectId) && Boolean(folderId)
  });

export const useListFolderAccessIdentities = ({
  projectId,
  folderId,
  offset = 0,
  limit = DEFAULT_LIMIT,
  search
}: TListFolderAccessActorsDTO) =>
  useQuery({
    queryKey: folderAccessKeys.listIdentities({ projectId, folderId, offset, limit, search }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        identities: TFolderAccessIdentity[];
        totalCount: number;
      }>(
        `${IDENTITY_FOLDER_ACCESS_API}/projects/${projectId}/folder-access/${folderId}/identities`,
        {
          params: { offset, limit, ...(search ? { search } : {}) }
        }
      );
      return data;
    },
    enabled: Boolean(projectId) && Boolean(folderId)
  });
