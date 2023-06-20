import { useMutation, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { UploadWsKeyDTO, UserWsKeyPair } from "./types";

const encKeyKeys = {
  getUserWorkspaceKey: (workspaceID: string) => ["workspace-key-pair", { workspaceID }] as const
};

const fetchUserWsKey = async (workspaceID: string) => {
  const { data } = await apiRequest.get<{ latestKey: UserWsKeyPair }>(
    `/api/v1/key/${workspaceID}/latest`
  );

  return data.latestKey;
};

export const useGetUserWsKey = (workspaceID: string) =>
  useQuery({
    queryKey: encKeyKeys.getUserWorkspaceKey(workspaceID),
    queryFn: () => fetchUserWsKey(workspaceID),
    enabled: Boolean(workspaceID)
  });

// mutations
export const useUploadWsKey = () =>
  useMutation<{}, {}, UploadWsKeyDTO>({
    mutationFn: ({ encryptedKey, nonce, userId, workspaceId }) =>
      apiRequest.post(`/api/v1/key/${workspaceId}`, { key: { userId, encryptedKey, nonce } })
  });
