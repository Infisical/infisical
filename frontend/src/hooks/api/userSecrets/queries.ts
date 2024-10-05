import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { Secrets } from "./types";


export const userSecretQueryKeys = {
  userSecrets: (credentialType: string) => [`userSecrets-${credentialType}`] as const,
};

export const useGetUserSecrets = (credentialType: string) => {
  return useQuery({
    queryKey: userSecretQueryKeys.userSecrets(credentialType),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ secrets: Secrets }>(
        `/api/v1/user-secrets?credentialType=${credentialType}`,
      );
      return data;
    }
  });
};