import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { organizationKeys } from "../organization/queries";
import { identitiesKeys } from "./queries";
import {
  AddIdentityAwsAuthDTO,
  AddIdentityAzureAuthDTO,
  AddIdentityGcpAuthDTO,
  AddIdentityKubernetesAuthDTO,
  AddIdentityOidcAuthDTO,
  AddIdentityUniversalAuthDTO,
  ClientSecretData,
  CreateIdentityDTO,
  CreateIdentityUniversalAuthClientSecretDTO,
  CreateIdentityUniversalAuthClientSecretRes,
  DeleteIdentityDTO,
  DeleteIdentityUniversalAuthClientSecretDTO,
  Identity,
  IdentityAwsAuth,
  IdentityAzureAuth,
  IdentityGcpAuth,
  IdentityKubernetesAuth,
  IdentityOidcAuth,
  IdentityUniversalAuth,
  UpdateIdentityAwsAuthDTO,
  UpdateIdentityAzureAuthDTO,
  UpdateIdentityDTO,
  UpdateIdentityGcpAuthDTO,
  UpdateIdentityKubernetesAuthDTO,
  UpdateIdentityOidcAuthDTO,
  UpdateIdentityUniversalAuthDTO
} from "./types";

export const useCreateIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation<Identity, {}, CreateIdentityDTO>({
    mutationFn: async (body) => {
      const {
        data: { identity }
      } = await apiRequest.post("/api/v1/identities/", body);
      return identity;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries(organizationKeys.getOrgIdentityMemberships(organizationId));
    }
  });
};

export const useUpdateIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation<Identity, {}, UpdateIdentityDTO>({
    mutationFn: async ({ identityId, name, role }) => {
      const {
        data: { identity }
      } = await apiRequest.patch(`/api/v1/identities/${identityId}`, {
        name,
        role
      });

      return identity;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries(organizationKeys.getOrgIdentityMemberships(organizationId));
    }
  });
};

export const useDeleteIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation<Identity, {}, DeleteIdentityDTO>({
    mutationFn: async ({ identityId }) => {
      const {
        data: { identity }
      } = await apiRequest.delete(`/api/v1/identities/${identityId}`);
      return identity;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries(organizationKeys.getOrgIdentityMemberships(organizationId));
    }
  });
};

// TODO: move these to /auth

export const useAddIdentityUniversalAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityUniversalAuth, {}, AddIdentityUniversalAuthDTO>({
    mutationFn: async ({
      identityId,
      clientSecretTrustedIps,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps
    }) => {
      const {
        data: { identityUniversalAuth }
      } = await apiRequest.post(`/api/v1/auth/universal-auth/identities/${identityId}`, {
        clientSecretTrustedIps,
        accessTokenTTL,
        accessTokenMaxTTL,
        accessTokenNumUsesLimit,
        accessTokenTrustedIps
      });
      return identityUniversalAuth;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries(organizationKeys.getOrgIdentityMemberships(organizationId));
    }
  });
};

export const useUpdateIdentityUniversalAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityUniversalAuth, {}, UpdateIdentityUniversalAuthDTO>({
    mutationFn: async ({
      identityId,
      clientSecretTrustedIps,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps
    }) => {
      const {
        data: { identityUniversalAuth }
      } = await apiRequest.patch(`/api/v1/auth/universal-auth/identities/${identityId}`, {
        clientSecretTrustedIps,
        accessTokenTTL,
        accessTokenMaxTTL,
        accessTokenNumUsesLimit,
        accessTokenTrustedIps
      });
      return identityUniversalAuth;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries(organizationKeys.getOrgIdentityMemberships(organizationId));
    }
  });
};

export const useCreateIdentityUniversalAuthClientSecret = () => {
  const queryClient = useQueryClient();
  return useMutation<
    CreateIdentityUniversalAuthClientSecretRes,
    {},
    CreateIdentityUniversalAuthClientSecretDTO
  >({
    mutationFn: async ({ identityId, description, ttl, numUsesLimit }) => {
      const { data } = await apiRequest.post(
        `/api/v1/auth/universal-auth/identities/${identityId}/client-secrets`,
        {
          description,
          ttl,
          numUsesLimit
        }
      );
      return data;
    },
    onSuccess: (_, { identityId }) => {
      queryClient.invalidateQueries(
        identitiesKeys.getIdentityUniversalAuthClientSecrets(identityId)
      );
    }
  });
};

export const useRevokeIdentityUniversalAuthClientSecret = () => {
  const queryClient = useQueryClient();
  return useMutation<ClientSecretData, {}, DeleteIdentityUniversalAuthClientSecretDTO>({
    mutationFn: async ({ identityId, clientSecretId }) => {
      const {
        data: { clientSecretData }
      } = await apiRequest.post<{ clientSecretData: ClientSecretData }>(
        `/api/v1/auth/universal-auth/identities/${identityId}/client-secrets/${clientSecretId}/revoke`
      );
      return clientSecretData;
    },
    onSuccess: (_, { identityId }) => {
      queryClient.invalidateQueries(
        identitiesKeys.getIdentityUniversalAuthClientSecrets(identityId)
      );
    }
  });
};

export const useAddIdentityGcpAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityGcpAuth, {}, AddIdentityGcpAuthDTO>({
    mutationFn: async ({
      identityId,
      type,
      allowedServiceAccounts,
      allowedProjects,
      allowedZones,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps
    }) => {
      const {
        data: { identityGcpAuth }
      } = await apiRequest.post<{ identityGcpAuth: IdentityGcpAuth }>(
        `/api/v1/auth/gcp-auth/identities/${identityId}`,
        {
          type,
          allowedServiceAccounts,
          allowedProjects,
          allowedZones,
          accessTokenTTL,
          accessTokenMaxTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps
        }
      );

      return identityGcpAuth;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries(organizationKeys.getOrgIdentityMemberships(organizationId));
    }
  });
};

export const useUpdateIdentityGcpAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityGcpAuth, {}, UpdateIdentityGcpAuthDTO>({
    mutationFn: async ({
      identityId,
      type,
      allowedServiceAccounts,
      allowedProjects,
      allowedZones,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps
    }) => {
      const {
        data: { identityGcpAuth }
      } = await apiRequest.patch<{ identityGcpAuth: IdentityGcpAuth }>(
        `/api/v1/auth/gcp-auth/identities/${identityId}`,
        {
          type,
          allowedServiceAccounts,
          allowedProjects,
          allowedZones,
          accessTokenTTL,
          accessTokenMaxTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps
        }
      );

      return identityGcpAuth;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries(organizationKeys.getOrgIdentityMemberships(organizationId));
    }
  });
};

export const useAddIdentityAwsAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityAwsAuth, {}, AddIdentityAwsAuthDTO>({
    mutationFn: async ({
      identityId,
      stsEndpoint,
      allowedPrincipalArns,
      allowedAccountIds,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps
    }) => {
      const {
        data: { identityAwsAuth }
      } = await apiRequest.post<{ identityAwsAuth: IdentityAwsAuth }>(
        `/api/v1/auth/aws-auth/identities/${identityId}`,
        {
          stsEndpoint,
          allowedPrincipalArns,
          allowedAccountIds,
          accessTokenTTL,
          accessTokenMaxTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps
        }
      );

      return identityAwsAuth;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries(organizationKeys.getOrgIdentityMemberships(organizationId));
    }
  });
};

export const useUpdateIdentityAwsAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityAwsAuth, {}, UpdateIdentityAwsAuthDTO>({
    mutationFn: async ({
      identityId,
      stsEndpoint,
      allowedPrincipalArns,
      allowedAccountIds,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps
    }) => {
      const {
        data: { identityAwsAuth }
      } = await apiRequest.patch<{ identityAwsAuth: IdentityAwsAuth }>(
        `/api/v1/auth/aws-auth/identities/${identityId}`,
        {
          stsEndpoint,
          allowedPrincipalArns,
          allowedAccountIds,
          accessTokenTTL,
          accessTokenMaxTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps
        }
      );

      return identityAwsAuth;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries(organizationKeys.getOrgIdentityMemberships(organizationId));
    }
  });
};

export const useUpdateIdentityOidcAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityOidcAuth, {}, UpdateIdentityOidcAuthDTO>({
    mutationFn: async ({
      identityId,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps,
      oidcDiscoveryUrl,
      caCert,
      boundIssuer,
      boundAudiences,
      boundClaims,
      boundSubject
    }) => {
      const {
        data: { identityOidcAuth }
      } = await apiRequest.patch<{ identityOidcAuth: IdentityOidcAuth }>(
        `/api/v1/auth/oidc-auth/identities/${identityId}`,
        {
          oidcDiscoveryUrl,
          caCert,
          boundIssuer,
          boundAudiences,
          boundClaims,
          boundSubject,
          accessTokenTTL,
          accessTokenMaxTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps
        }
      );

      return identityOidcAuth;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries(organizationKeys.getOrgIdentityMemberships(organizationId));
    }
  });
};

export const useAddIdentityOidcAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityOidcAuth, {}, AddIdentityOidcAuthDTO>({
    mutationFn: async ({
      identityId,
      oidcDiscoveryUrl,
      caCert,
      boundIssuer,
      boundAudiences,
      boundClaims,
      boundSubject,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps
    }) => {
      const {
        data: { identityOidcAuth }
      } = await apiRequest.post<{ identityOidcAuth: IdentityOidcAuth }>(
        `/api/v1/auth/oidc-auth/identities/${identityId}`,
        {
          oidcDiscoveryUrl,
          caCert,
          boundIssuer,
          boundAudiences,
          boundClaims,
          boundSubject,
          accessTokenTTL,
          accessTokenMaxTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps
        }
      );

      return identityOidcAuth;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries(organizationKeys.getOrgIdentityMemberships(organizationId));
    }
  });
};

export const useAddIdentityAzureAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityAzureAuth, {}, AddIdentityAzureAuthDTO>({
    mutationFn: async ({
      identityId,
      tenantId,
      resource,
      allowedServicePrincipalIds,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps
    }) => {
      const {
        data: { identityAzureAuth }
      } = await apiRequest.post<{ identityAzureAuth: IdentityAzureAuth }>(
        `/api/v1/auth/azure-auth/identities/${identityId}`,
        {
          tenantId,
          resource,
          allowedServicePrincipalIds,
          accessTokenTTL,
          accessTokenMaxTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps
        }
      );

      return identityAzureAuth;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries(organizationKeys.getOrgIdentityMemberships(organizationId));
    }
  });
};

export const useAddIdentityKubernetesAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityKubernetesAuth, {}, AddIdentityKubernetesAuthDTO>({
    mutationFn: async ({
      identityId,
      kubernetesHost,
      tokenReviewerJwt,
      allowedNames,
      allowedNamespaces,
      allowedAudience,
      caCert,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps
    }) => {
      const {
        data: { identityKubernetesAuth }
      } = await apiRequest.post<{ identityKubernetesAuth: IdentityKubernetesAuth }>(
        `/api/v1/auth/kubernetes-auth/identities/${identityId}`,
        {
          kubernetesHost,
          tokenReviewerJwt,
          allowedNames,
          allowedNamespaces,
          allowedAudience,
          caCert,
          accessTokenTTL,
          accessTokenMaxTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps
        }
      );

      return identityKubernetesAuth;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries(organizationKeys.getOrgIdentityMemberships(organizationId));
    }
  });
};

export const useUpdateIdentityAzureAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityAzureAuth, {}, UpdateIdentityAzureAuthDTO>({
    mutationFn: async ({
      identityId,
      tenantId,
      resource,
      allowedServicePrincipalIds,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps
    }) => {
      const {
        data: { identityAzureAuth }
      } = await apiRequest.patch<{ identityAzureAuth: IdentityAzureAuth }>(
        `/api/v1/auth/azure-auth/identities/${identityId}`,
        {
          tenantId,
          resource,
          allowedServicePrincipalIds,
          accessTokenTTL,
          accessTokenMaxTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps
        }
      );

      return identityAzureAuth;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries(organizationKeys.getOrgIdentityMemberships(organizationId));
    }
  });
};

export const useUpdateIdentityKubernetesAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityKubernetesAuth, {}, UpdateIdentityKubernetesAuthDTO>({
    mutationFn: async ({
      identityId,
      kubernetesHost,
      tokenReviewerJwt,
      allowedNamespaces,
      allowedNames,
      allowedAudience,
      caCert,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps
    }) => {
      const {
        data: { identityKubernetesAuth }
      } = await apiRequest.patch<{ identityKubernetesAuth: IdentityKubernetesAuth }>(
        `/api/v1/auth/kubernetes-auth/identities/${identityId}`,
        {
          kubernetesHost,
          tokenReviewerJwt,
          allowedNames,
          allowedNamespaces,
          allowedAudience,
          caCert,
          accessTokenTTL,
          accessTokenMaxTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps
        }
      );

      return identityKubernetesAuth;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries(organizationKeys.getOrgIdentityMemberships(organizationId));
    }
  });
};
