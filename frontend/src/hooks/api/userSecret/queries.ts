import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@app/config/request";

import { TUserSecret } from "./types";

export const userSecretKeys = {
  all: ["user-secrets"] as const,
  allUserSecrets: () => [...userSecretKeys.all] as const,
  userSecret: (id: string) => [...userSecretKeys.allUserSecrets(), id] as const
    };

    export const useGetUserSecrets = ({ offset = 0, limit = 10, type = null, searchQuery = ""}: { offset: number; limit: number, type: string | null, searchQuery: string }) => {
  return useQuery({
    queryKey: [...userSecretKeys.allUserSecrets(), offset,limit, type, searchQuery],
    queryFn: async () => {
      const { data } = await apiRequest.get<TUserSecret[]>("/api/v1/user-secret", {
        params: {
          offset,
          limit: limit,
          type: type,
          searchQuery: searchQuery
        }
      });
      return data;
    }
  });
};

export const useGetUserSecret = (secretId: string) => {
  return useQuery({
    queryKey: userSecretKeys.userSecret(secretId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TUserSecret>(
        `/api/v1/user-secret/${secretId}`
      );
      return data;
    }
  });
};

