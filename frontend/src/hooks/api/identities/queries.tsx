import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  ClientSecretData,
  IdentityAwsAuth,
  IdentityKubernetesAuth,
  IdentityUniversalAuth} from "./types";

export const identitiesKeys = {
  getIdentityUniversalAuth: (identityId: string) =>
    [{ identityId }, "identity-universal-auth"] as const,
  getIdentityUniversalAuthClientSecrets: (identityId: string) =>
    [{ identityId }, "identity-universal-auth-client-secrets"] as const,
  getIdentityAwsAuth: (identityId: string) => [{ identityId }, "identity-aws-auth"] as const,
  getIdentityKubernetesAuth: (identityId: string) =>
    [{ identityId }, "identity-kubernetes-auth"] as const
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

export const useGetIdentityAwsAuth = (identityId: string) => {
  return useQuery({
    enabled: Boolean(identityId),
    queryKey: identitiesKeys.getIdentityAwsAuth(identityId),
    queryFn: async () => {
      const {
        data: { identityAwsAuth }
      } = await apiRequest.get<{ identityAwsAuth: IdentityAwsAuth }>(
        `/api/v1/auth/aws-auth/identities/${identityId}`
      );
      return identityAwsAuth;
    }
  });
};

export const useGetIdentityKubernetesAuth = (identityId: string) => {
  return useQuery({
    enabled: Boolean(identityId),
    queryKey: identitiesKeys.getIdentityKubernetesAuth(identityId),
    queryFn: async () => {
      const {
        data: { identityKubernetesAuth }
      } = await apiRequest.get<{ identityKubernetesAuth: IdentityKubernetesAuth }>(
        `/api/v1/auth/kubernetes-auth/identities/${identityId}`
      );
      return identityKubernetesAuth;
    }
  });
};
