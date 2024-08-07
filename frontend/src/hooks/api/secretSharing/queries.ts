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

export const useGetActiveSharedSecretById = ({
  sharedSecretId,
  hashedHex
}: {
  sharedSecretId: string;
  hashedHex: string;
}) => {
  return useQuery<TViewSharedSecretResponse, [string]>({
    enabled: Boolean(sharedSecretId) && Boolean(hashedHex),
    queryFn: async () => {
      const params = new URLSearchParams({
        hashedHex
      });

      const { data } = await apiRequest.get<TViewSharedSecretResponse>(
        `/api/v1/secret-sharing/public/${sharedSecretId}`,
        {
          params
        }
      );

      if (!data) return null;

      return {
        encryptedValue: data.encryptedValue,
        password: data.password,
        iv: data.iv,
        tag: data.tag,
        accessType: data.accessType,
        orgName: data.orgName
      };
    }
  });
};

// returns a secret (secret or undefined if password doesn't match)
export const fetchSecretIfPasswordIsValid = async (
  sharedSecretId: string,
  hashedHex: string,
  password: string,
) => {
  const { data } = await apiRequest.post<TViewSharedSecretResponse>(
    `/api/v1/secret-sharing/public/${sharedSecretId}/validate`,
    {
      hashedHex,
      password
    }
  );

  return data;
};
