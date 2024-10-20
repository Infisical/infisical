import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TUserSecrets } from "./types";


export const allSecretKeys = {
  allUserSecrets: () => ["userSecrets"] as const,
  specificSecrets: ({ offset, limit }: { offset: number; limit: number }) =>
    [...allSecretKeys.allUserSecrets(), { offset, limit }] as const,
  getSecretById: (arg: { id: string; hashedHex: string | null; password?: string }) => [
    "secret",
    arg
  ]
};

export const useGetAllSecrets = ({
  offset = 0,
  limit = 25
}: {
  offset: number;
  limit: number;
}) => {
  return useQuery({
    queryKey: allSecretKeys.specificSecrets({ offset, limit }),
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit)
      });

      const { data } = await apiRequest.get<{ secrets: TUserSecrets[]; totalCount: number }>(
        "/api/v1/user-secrets/",
        {
          params
        }
      );
      return data;
    }
  });
};
export const userCredentialsKeys = {
  allCredentials: () => ["credentials"] as const,
  specificCredential: ({ id }: { id: string }) => [
    ...userCredentialsKeys.allCredentials(),
    { id }
  ] as const
};