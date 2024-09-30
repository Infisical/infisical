import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  ClientSecretData,
  IdentityAccessToken,
  IdentityAwsAuth,
  IdentityAzureAuth,
  IdentityGcpAuth,
  IdentityKubernetesAuth,
  IdentityMembership,
  IdentityMembershipOrg,
  IdentityOidcAuth,
  IdentityTokenAuth,
  IdentityUniversalAuth
} from "./types";

export const identitiesKeys = {
  getIdentityById: (identityId: string) => [{ identityId }, "identity"] as const,
  getIdentityUniversalAuth: (identityId: string) =>
    [{ identityId }, "identity-universal-auth"] as const,
  getIdentityUniversalAuthClientSecrets: (identityId: string) =>
    [{ identityId }, "identity-universal-auth-client-secrets"] as const,
  getIdentityKubernetesAuth: (identityId: string) =>
    [{ identityId }, "identity-kubernetes-auth"] as const,
  getIdentityGcpAuth: (identityId: string) => [{ identityId }, "identity-gcp-auth"] as const,
  getIdentityOidcAuth: (identityId: string) => [{ identityId }, "identity-oidc-auth"] as const,
  getIdentityAwsAuth: (identityId: string) => [{ identityId }, "identity-aws-auth"] as const,
  getIdentityAzureAuth: (identityId: string) => [{ identityId }, "identity-azure-auth"] as const,
  getIdentityTokenAuth: (identityId: string) => [{ identityId }, "identity-token-auth"] as const,
  getIdentityTokensTokenAuth: (identityId: string) =>
    [{ identityId }, "identity-tokens-token-auth"] as const,
  getIdentityProjectMemberships: (identityId: string) =>
    [{ identityId }, "identity-project-memberships"] as const
};

export const useGetIdentityById = (identityId: string) => {
  return useQuery({
    enabled: Boolean(identityId),
    queryKey: identitiesKeys.getIdentityById(identityId),
    queryFn: async () => {
      const {
        data: { identity }
      } = await apiRequest.get<{ identity: IdentityMembershipOrg }>(
        `/api/v1/identities/${identityId}`
      );
      return identity;
    }
  });
};

export const useGetIdentityProjectMemberships = (identityId: string) => {
  return useQuery({
    enabled: Boolean(identityId),
    queryKey: identitiesKeys.getIdentityProjectMemberships(identityId),
    queryFn: async () => {
      const {
        data: { identityMemberships }
      } = await apiRequest.get<{ identityMemberships: IdentityMembership[] }>(
        `/api/v1/identities/${identityId}/identity-memberships`
      );
      return identityMemberships;
    }
  });
};

export const useGetIdentityUniversalAuth = (
  identityId: string,
  options?: UseQueryOptions<
    IdentityUniversalAuth,
    unknown,
    IdentityUniversalAuth,
    ReturnType<typeof identitiesKeys.getIdentityUniversalAuth>
  >
) => {
  return useQuery({
    queryKey: identitiesKeys.getIdentityUniversalAuth(identityId),
    queryFn: async () => {
      const {
        data: { identityUniversalAuth }
      } = await apiRequest.get<{ identityUniversalAuth: IdentityUniversalAuth }>(
        `/api/v1/auth/universal-auth/identities/${identityId}`
      );
      return identityUniversalAuth;
    },
    cacheTime: 0,
    staleTime: 0,
    ...options,
    enabled: Boolean(identityId) && (options?.enabled ?? true)
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

export const useGetIdentityGcpAuth = (
  identityId: string,
  options?: UseQueryOptions<
    IdentityGcpAuth,
    unknown,
    IdentityGcpAuth,
    ReturnType<typeof identitiesKeys.getIdentityGcpAuth>
  >
) => {
  return useQuery({
    queryKey: identitiesKeys.getIdentityGcpAuth(identityId),
    queryFn: async () => {
      const {
        data: { identityGcpAuth }
      } = await apiRequest.get<{ identityGcpAuth: IdentityGcpAuth }>(
        `/api/v1/auth/gcp-auth/identities/${identityId}`
      );
      return identityGcpAuth;
    },
    staleTime: 0,
    cacheTime: 0,
    ...options,
    enabled: Boolean(identityId) && (options?.enabled ?? true)
  });
};

export const useGetIdentityAwsAuth = (
  identityId: string,
  options?: UseQueryOptions<
    IdentityAwsAuth,
    unknown,
    IdentityAwsAuth,
    ReturnType<typeof identitiesKeys.getIdentityAwsAuth>
  >
) => {
  return useQuery({
    queryKey: identitiesKeys.getIdentityAwsAuth(identityId),
    queryFn: async () => {
      const {
        data: { identityAwsAuth }
      } = await apiRequest.get<{ identityAwsAuth: IdentityAwsAuth }>(
        `/api/v1/auth/aws-auth/identities/${identityId}`
      );
      return identityAwsAuth;
    },
    staleTime: 0,
    cacheTime: 0,
    ...options,
    enabled: Boolean(identityId) && (options?.enabled ?? true)
  });
};

export const useGetIdentityAzureAuth = (
  identityId: string,
  options?: UseQueryOptions<
    IdentityAzureAuth,
    unknown,
    IdentityAzureAuth,
    ReturnType<typeof identitiesKeys.getIdentityAzureAuth>
  >
) => {
  return useQuery({
    queryKey: identitiesKeys.getIdentityAzureAuth(identityId),
    queryFn: async () => {
      const {
        data: { identityAzureAuth }
      } = await apiRequest.get<{ identityAzureAuth: IdentityAzureAuth }>(
        `/api/v1/auth/azure-auth/identities/${identityId}`
      );
      return identityAzureAuth;
    },
    staleTime: 0,
    cacheTime: 0,
    ...options,
    enabled: Boolean(identityId) && (options?.enabled ?? true)
  });
};

export const useGetIdentityKubernetesAuth = (
  identityId: string,
  options?: UseQueryOptions<
    IdentityKubernetesAuth,
    unknown,
    IdentityKubernetesAuth,
    ReturnType<typeof identitiesKeys.getIdentityKubernetesAuth>
  >
) => {
  return useQuery({
    queryKey: identitiesKeys.getIdentityKubernetesAuth(identityId),
    queryFn: async () => {
      const {
        data: { identityKubernetesAuth }
      } = await apiRequest.get<{ identityKubernetesAuth: IdentityKubernetesAuth }>(
        `/api/v1/auth/kubernetes-auth/identities/${identityId}`
      );
      return identityKubernetesAuth;
    },
    staleTime: 0,
    cacheTime: 0,
    ...options,
    enabled: Boolean(identityId) && (options?.enabled ?? true)
  });
};

export const useGetIdentityTokenAuth = (
  identityId: string,
  options?: UseQueryOptions<
    IdentityTokenAuth,
    unknown,
    IdentityTokenAuth,
    ReturnType<typeof identitiesKeys.getIdentityTokenAuth>
  >
) => {
  return useQuery({
    queryKey: identitiesKeys.getIdentityTokenAuth(identityId),
    queryFn: async () => {
      const {
        data: { identityTokenAuth }
      } = await apiRequest.get<{ identityTokenAuth: IdentityTokenAuth }>(
        `/api/v1/auth/token-auth/identities/${identityId}`
      );
      return identityTokenAuth;
    },
    staleTime: 0,
    cacheTime: 0,
    ...options,
    enabled: Boolean(identityId) && (options?.enabled ?? true)
  });
};

export const useGetIdentityTokensTokenAuth = (identityId: string) => {
  return useQuery({
    enabled: Boolean(identityId),
    queryKey: identitiesKeys.getIdentityTokensTokenAuth(identityId),
    queryFn: async () => {
      const {
        data: { tokens }
      } = await apiRequest.get<{ tokens: IdentityAccessToken[] }>(
        `/api/v1/auth/token-auth/identities/${identityId}/tokens`
      );
      return tokens;
    }
  });
};

export const useGetIdentityOidcAuth = (
  identityId: string,
  options?: UseQueryOptions<
    IdentityOidcAuth,
    unknown,
    IdentityOidcAuth,
    ReturnType<typeof identitiesKeys.getIdentityOidcAuth>
  >
) => {
  return useQuery({
    queryKey: identitiesKeys.getIdentityOidcAuth(identityId),
    queryFn: async () => {
      const {
        data: { identityOidcAuth }
      } = await apiRequest.get<{ identityOidcAuth: IdentityOidcAuth }>(
        `/api/v1/auth/oidc-auth/identities/${identityId}`
      );
      return identityOidcAuth;
    },
    staleTime: 0,
    cacheTime: 0,
    ...options,
    enabled: Boolean(identityId) && (options?.enabled ?? true)
  });
};
