import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { Secrets } from "./types";


export const userSecretQueryKeys = {
  userSecrets: () => ["userSecrets"] as const,
};

export const useGetUserSecrets = () => {
  return useQuery({
    queryKey: userSecretQueryKeys.userSecrets(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ secrets: Secrets }>(
        "/api/v1/user-secrets",
      );
      return data;
    }
  });
};