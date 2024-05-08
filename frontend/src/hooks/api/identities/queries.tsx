import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { ClientSecretData, IdentityAwsIamAuth,IdentityUniversalAuth } from "./types";

export const identitiesKeys = {
  getIdentityUniversalAuth: (identityId: string) =>
    [{ identityId }, "identity-universal-auth"] as const,
  getIdentityUniversalAuthClientSecrets: (identityId: string) =>
    [{ identityId }, "identity-universal-auth-client-secrets"] as const,
  getIdentityAwsIamAuth: (identityId: string) => [{ identityId }, "identity-aws-iam-auth"] as const
};

export const useGetIdentityUniversalAuth = (identityId: string) => {
  return useQuery({
    enabled: Boolean(identityId),
    queryKey: identitiesKeys.getIdentityUniversalAuth(identityId),
    queryFn: async () => {
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
    enabled: Boolean(identityId),
    queryKey: identitiesKeys.getIdentityUniversalAuthClientSecrets(identityId),
    queryFn: async () => {
      const {
        data: { clientSecretData }
      } = await apiRequest.get<{ clientSecretData: ClientSecretData[] }>(
        `/api/v1/auth/universal-auth/identities/${identityId}/client-secrets`
      );
      return clientSecretData;
    }
  });
};

export const useGetIdentityAwsIamAuth = (identityId: string) => {
  return useQuery({
    enabled: Boolean(identityId),
    queryKey: identitiesKeys.getIdentityAwsIamAuth(identityId),
    queryFn: async () => {
      const {
        data: { identityAwsIamAuth }
      } = await apiRequest.get<{ identityAwsIamAuth: IdentityAwsIamAuth }>(
        `/api/v1/auth/aws-iam-auth/identities/${identityId}`
      );
      return identityAwsIamAuth;
    }
  });
};
