import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { ClientSecretData, IdentityUniversalAuth } from "./types";

export const identitiesKeys = {
  getIdentityUniversalAuth: (identityId: string) =>
    [{ identityId }, "identity-universal-auth"] as const,
  getIdentityUniversalAuthClientSecrets: (identityId: string) =>
    [{ identityId }, "identity-universal-auth-client-secrets"] as const
};

export const useGetIdentityUniversalAuth = (identityId: string) => {
  return useQuery({
    queryKey: identitiesKeys.getIdentityUniversalAuth(identityId),
    queryFn: async () => {
      if (identityId === "") throw new Error("Identity ID is required");

      const {
        data: { identityUniversalAuth }
      } = await apiRequest.get<{ identityUniversalAuth: IdentityUniversalAuth }>(
        `/api/v1/auth/universal-auth/identities/${identityId}`
      );

      return identityUniversalAuth;
    }
  });
};

export const useGetIdentityUniversalAuthClientSecrets = (identityId: string) => {
  return useQuery({
    queryKey: identitiesKeys.getIdentityUniversalAuthClientSecrets(identityId),
    queryFn: async () => {
      if (identityId === "") return [];

      const {
        data: { clientSecretData }
      } = await apiRequest.get<{ clientSecretData: ClientSecretData[] }>(
        `/api/v1/auth/universal-auth/identities/${identityId}/client-secrets`
      );

      return clientSecretData;
    }
  });
};
