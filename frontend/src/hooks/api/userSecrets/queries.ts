import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TUserSecret, UserSecretType } from "./types";

export const userSecretKeys = {
  allUserSecrets: () => ["userSecrets"] as const,
  specificUserSecrets: ({
    offset,
    limit,
    secretType
  }: {
    offset: number;
    limit: number;
    secretType: UserSecretType;
  }) => [...userSecretKeys.allUserSecrets(), { offset, limit, secretType }] as const
};

export const useGetUserSecrets = ({
  offset = 0,
  limit = 25,
  secretType
}: {
  offset: number;
  limit: number;
  secretType: UserSecretType;
}) => {
  return useQuery({
    queryKey: userSecretKeys.specificUserSecrets({ offset, limit, secretType }),
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
        secretType: String(secretType)
      });

      const { data } = await apiRequest.get<{ secrets: TUserSecret[]; totalCount: number }>(
        "/api/v1/user-secrets",
        {
          params
        }
      );
      return data;
    }
  });
};
