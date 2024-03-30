import { useMutation, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { UploadWsKeyDTO, UserWsKeyPair } from "./types";

const encKeyKeys = {
  getUserWorkspaceKey: (workspaceID: string) => ["workspace-key-pair", { workspaceID }] as const
};

export const fetchUserWsKey = async (projectId: string) => {
  const { data } = await apiRequest.get<UserWsKeyPair>(
    `/api/v2/workspace/${projectId}/encrypted-key`
  );

  return data;
};

export const useGetUserWsKey = (workspaceID: string) =>
  useQuery({
    queryKey: encKeyKeys.getUserWorkspaceKey(workspaceID),
    queryFn: () => fetchUserWsKey(workspaceID),
    enabled: Boolean(workspaceID)
  });

// mutations
export const uploadWsKey = async ({ workspaceId, userId, encryptedKey, nonce }: UploadWsKeyDTO) => {
  return apiRequest.post(`/api/v1/workspace/${workspaceId}/key`, {
    key: { userId, encryptedKey, nonce }
  });
};

export const useUploadWsKey = () =>
  useMutation<{}, {}, UploadWsKeyDTO>({
    mutationFn: async ({ encryptedKey, nonce, userId, workspaceId }) => {
      return uploadWsKey({
        workspaceId,
        userId,
        encryptedKey,
        nonce
      });
    }
  });
