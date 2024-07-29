import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TSharedSecret, TViewSharedSecretResponse } from "./types";

export const secretSharingKeys = {
  allSharedSecrets: () => ["sharedSecrets"] as const,
  specificSharedSecrets: ({ offset, limit }: { offset: number; limit: number }) =>
    [...secretSharingKeys.allSharedSecrets(), { offset, limit }] as const
};

export const useGetSharedSecrets = ({
  offset = 0,
  limit = 25
}: {
  offset: number;
  limit: number;
}) => {
  return useQuery({
    queryKey: secretSharingKeys.specificSharedSecrets({ offset, limit }),
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit)
      });

      const { data } = await apiRequest.get<{ secrets: TSharedSecret[]; totalCount: number }>(
        "/api/v1/secret-sharing/",
        {
          params
        }
      );
      return data;
    }
  });
};

export const useGetActiveSharedSecretById = (secretId: string) => {
  return useQuery<TViewSharedSecretResponse, [string]>({
    enabled: Boolean(secretId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TViewSharedSecretResponse>(
        `/api/v1/secret-sharing/public/${secretId}`
      );
      return {
        encryptedValue: data.encryptedValue,
        iv: data.iv,
        tag: data.tag,
        accessType: data.accessType,
        orgName: data.orgName
      };
    }
  });
};
