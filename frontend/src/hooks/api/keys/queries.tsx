import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@app/config/request';

import { UserWsKeyPair } from './types';

const encKeyKeys = {
  getUserWorkspaceKey: (workspaceID: string) => ['worksapce-key-pair', { workspaceID }] as const
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
