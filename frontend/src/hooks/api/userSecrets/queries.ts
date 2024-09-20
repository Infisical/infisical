import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TUserSecret, TViewUserSecretResponse } from "./types";

export const userSecretKeys = {
  allUserSecrets: () => ["userSecrets"] as const,
  specificUserSecrets: ({ offset, limit }: { offset: number; limit: number }) =>
    [...userSecretKeys.allUserSecrets(), { offset, limit }] as const,
  getSecretById: (arg: { id: string; hashedHex: string; password?: string }) => [
    "user-secrets",
    arg
  ]
};

export const useGetUserSecrets = ({
  offset = 0,
  limit = 25
}: {
  offset: number;
  limit: number;
}) => {
  return useQuery({
    queryKey: userSecretKeys.specificUserSecrets({ offset, limit }),
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit)
      });

      const { data } = await apiRequest.get<{ secrets: TUserSecret[]; totalCount: number }>(
        "/api/v1/user-secrets/",
        {
          params
        }
      );
      return data;
    }
  });
};

export const useGetActiveUserSecretById = ({
  sharedSecretId,
  hashedHex,
  password
}: {
  sharedSecretId: string;
  hashedHex: string;
  password?: string;
}) => {
  return useQuery<TViewUserSecretResponse>(
    userSecretKeys.getSecretById({ id: sharedSecretId, hashedHex, password }),
    async () => {
      const { data } = await apiRequest.post<TViewUserSecretResponse>(
        `/api/v1/user-secrets/public/${sharedSecretId}`,
        {
          hashedHex,
          password
        }
      );

      return data;
    },
    {
      enabled: Boolean(sharedSecretId) && Boolean(hashedHex)
    }
  );
};
