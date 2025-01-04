import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { organizationKeys } from "../organization/queries";
import { identitiesKeys } from "./queries";
import {
  AddIdentityAwsAuthDTO,
  AddIdentityAzureAuthDTO,
  AddIdentityGcpAuthDTO,
  AddIdentityJwtAuthDTO,
  AddIdentityKubernetesAuthDTO,
  AddIdentityOidcAuthDTO,
  AddIdentityTokenAuthDTO,
  AddIdentityUniversalAuthDTO,
  ClientSecretData,
  CreateIdentityDTO,
  CreateIdentityUniversalAuthClientSecretDTO,
  CreateIdentityUniversalAuthClientSecretRes,
  CreateTokenIdentityTokenAuthDTO,
  CreateTokenIdentityTokenAuthRes,
  DeleteIdentityAwsAuthDTO,
  DeleteIdentityAzureAuthDTO,
  DeleteIdentityDTO,
  DeleteIdentityGcpAuthDTO,
  DeleteIdentityJwtAuthDTO,
  DeleteIdentityKubernetesAuthDTO,
  DeleteIdentityOidcAuthDTO,
  DeleteIdentityTokenAuthDTO,
  DeleteIdentityUniversalAuthClientSecretDTO,
  DeleteIdentityUniversalAuthDTO,
  Identity,
  IdentityAccessToken,
  IdentityAwsAuth,
  IdentityAzureAuth,
  IdentityGcpAuth,
  IdentityJwtAuth,
  IdentityKubernetesAuth,
  IdentityOidcAuth,
  IdentityTokenAuth,
  IdentityUniversalAuth,
  RevokeTokenDTO,
  RevokeTokenRes,
  UpdateIdentityAwsAuthDTO,
  UpdateIdentityAzureAuthDTO,
  UpdateIdentityDTO,
  UpdateIdentityGcpAuthDTO,
  UpdateIdentityJwtAuthDTO,
  UpdateIdentityKubernetesAuthDTO,
  UpdateIdentityOidcAuthDTO,
  UpdateIdentityTokenAuthDTO,
  UpdateIdentityUniversalAuthDTO,
  UpdateTokenIdentityTokenAuthDTO
} from "./types";

export const useCreateIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation<Identity, object, CreateIdentityDTO>({
    mutationFn: async (body) => {
      const {
        data: { identity }
      } = await apiRequest.post("/api/v1/identities/", body);
      return identity;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
    }
  });
};

export const useUpdateIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation<Identity, object, UpdateIdentityDTO>({
    mutationFn: async ({ identityId, name, role, metadata }) => {
      const {
        data: { identity }
      } = await apiRequest.patch(`/api/v1/identities/${identityId}`, {
        name,
        role,
        metadata
      });

      return identity;
    },
    onSuccess: (_, { organizationId, identityId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
    }
  });
};

export const useDeleteIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation<Identity, object, DeleteIdentityDTO>({
    mutationFn: async ({ identityId }) => {
      const {
        data: { identity }
      } = await apiRequest.delete(`/api/v1/identities/${identityId}`);
      return identity;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
    }
  });
};

// TODO: move these to /auth

export const useAddIdentityUniversalAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityUniversalAuth, object, AddIdentityUniversalAuthDTO>({
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
    onSuccess: (_, { identityId, organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityUniversalAuth(identityId)
      });
    }
  });
};

export const useUpdateIdentityUniversalAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityUniversalAuth, object, UpdateIdentityUniversalAuthDTO>({
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
    onSuccess: (_, { identityId, organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityUniversalAuth(identityId)
      });
    }
  });
};

export const useDeleteIdentityUniversalAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityUniversalAuth, object, DeleteIdentityUniversalAuthDTO>({
    mutationFn: async ({ identityId }) => {
      const {
        data: { identityUniversalAuth }
      } = await apiRequest.delete(`/api/v1/auth/universal-auth/identities/${identityId}`);
      return identityUniversalAuth;
    },
    onSuccess: (_, { organizationId, identityId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityUniversalAuth(identityId)
      });
    }
  });
};

export const useCreateIdentityUniversalAuthClientSecret = () => {
  const queryClient = useQueryClient();
  return useMutation<
    CreateIdentityUniversalAuthClientSecretRes,
    object,
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
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityUniversalAuthClientSecrets(identityId)
      });
    }
  });
};

export const useRevokeIdentityUniversalAuthClientSecret = () => {
  const queryClient = useQueryClient();
  return useMutation<ClientSecretData, object, DeleteIdentityUniversalAuthClientSecretDTO>({
    mutationFn: async ({ identityId, clientSecretId }) => {
      const {
        data: { clientSecretData }
      } = await apiRequest.post<{ clientSecretData: ClientSecretData }>(
        `/api/v1/auth/universal-auth/identities/${identityId}/client-secrets/${clientSecretId}/revoke`
      );
      return clientSecretData;
    },
    onSuccess: (_, { identityId }) => {
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityUniversalAuthClientSecrets(identityId)
      });
    }
  });
};

export const useAddIdentityGcpAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityGcpAuth, object, AddIdentityGcpAuthDTO>({
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
    onSuccess: (_, { identityId, organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityGcpAuth(identityId) });
    }
  });
};

export const useUpdateIdentityGcpAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityGcpAuth, object, UpdateIdentityGcpAuthDTO>({
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
    onSuccess: (_, { identityId, organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityGcpAuth(identityId) });
    }
  });
};

export const useDeleteIdentityGcpAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityGcpAuth, object, DeleteIdentityGcpAuthDTO>({
    mutationFn: async ({ identityId }) => {
      const {
        data: { identityGcpAuth }
      } = await apiRequest.delete(`/api/v1/auth/gcp-auth/identities/${identityId}`);
      return identityGcpAuth;
    },
    onSuccess: (_, { organizationId, identityId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityGcpAuth(identityId) });
    }
  });
};

export const useAddIdentityAwsAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityAwsAuth, object, AddIdentityAwsAuthDTO>({
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
    onSuccess: (_, { identityId, organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityAwsAuth(identityId) });
    }
  });
};

export const useUpdateIdentityAwsAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityAwsAuth, object, UpdateIdentityAwsAuthDTO>({
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
    onSuccess: (_, { identityId, organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityAwsAuth(identityId) });
    }
  });
};

export const useDeleteIdentityAwsAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityAwsAuth, object, DeleteIdentityAwsAuthDTO>({
    mutationFn: async ({ identityId }) => {
      const {
        data: { identityAwsAuth }
      } = await apiRequest.delete(`/api/v1/auth/aws-auth/identities/${identityId}`);
      return identityAwsAuth;
    },
    onSuccess: (_, { organizationId, identityId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityAwsAuth(identityId) });
    }
  });
};

export const useUpdateIdentityOidcAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityOidcAuth, object, UpdateIdentityOidcAuthDTO>({
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
    onSuccess: (_, { identityId, organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityOidcAuth(identityId) });
    }
  });
};

export const useAddIdentityOidcAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityOidcAuth, object, AddIdentityOidcAuthDTO>({
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
    onSuccess: (_, { identityId, organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityOidcAuth(identityId) });
    }
  });
};

export const useDeleteIdentityOidcAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityTokenAuth, object, DeleteIdentityOidcAuthDTO>({
    mutationFn: async ({ identityId }) => {
      const {
        data: { identityOidcAuth }
      } = await apiRequest.delete(`/api/v1/auth/oidc-auth/identities/${identityId}`);
      return identityOidcAuth;
    },
    onSuccess: (_, { organizationId, identityId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityOidcAuth(identityId) });
    }
  });
};
export const useUpdateIdentityJwtAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityJwtAuth, object, UpdateIdentityJwtAuthDTO>({
    mutationFn: async ({
      identityId,
      configurationType,
      jwksUrl,
      jwksCaCert,
      publicKeys,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps,
      boundIssuer,
      boundAudiences,
      boundClaims,
      boundSubject
    }) => {
      const {
        data: { identityJwtAuth }
      } = await apiRequest.patch<{ identityJwtAuth: IdentityJwtAuth }>(
        `/api/v1/auth/jwt-auth/identities/${identityId}`,
        {
          configurationType,
          jwksUrl,
          jwksCaCert,
          publicKeys,
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

      return identityJwtAuth;
    },
    onSuccess: (_, { identityId, organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityJwtAuth(identityId) });
    }
  });
};

export const useAddIdentityJwtAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityJwtAuth, object, AddIdentityJwtAuthDTO>({
    mutationFn: async ({
      identityId,
      configurationType,
      jwksUrl,
      jwksCaCert,
      publicKeys,
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
        data: { identityJwtAuth }
      } = await apiRequest.post<{ identityJwtAuth: IdentityJwtAuth }>(
        `/api/v1/auth/jwt-auth/identities/${identityId}`,
        {
          configurationType,
          jwksUrl,
          jwksCaCert,
          publicKeys,
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

      return identityJwtAuth;
    },
    onSuccess: (_, { identityId, organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityJwtAuth(identityId) });
    }
  });
};

export const useDeleteIdentityJwtAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityTokenAuth, object, DeleteIdentityJwtAuthDTO>({
    mutationFn: async ({ identityId }) => {
      const {
        data: { identityJwtAuth }
      } = await apiRequest.delete(`/api/v1/auth/jwt-auth/identities/${identityId}`);
      return identityJwtAuth;
    },
    onSuccess: (_, { organizationId, identityId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityJwtAuth(identityId) });
    }
  });
};

export const useAddIdentityAzureAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityAzureAuth, object, AddIdentityAzureAuthDTO>({
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
    onSuccess: (_, { identityId, organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityKubernetesAuth(identityId)
      });
    }
  });
};

export const useAddIdentityKubernetesAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityKubernetesAuth, object, AddIdentityKubernetesAuthDTO>({
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
    onSuccess: (_, { identityId, organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityAzureAuth(identityId) });
    }
  });
};

export const useUpdateIdentityAzureAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityAzureAuth, object, UpdateIdentityAzureAuthDTO>({
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
    onSuccess: (_, { identityId, organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityAzureAuth(identityId) });
    }
  });
};

export const useDeleteIdentityAzureAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityAzureAuth, object, DeleteIdentityAzureAuthDTO>({
    mutationFn: async ({ identityId }) => {
      const {
        data: { identityAzureAuth }
      } = await apiRequest.delete(`/api/v1/auth/azure-auth/identities/${identityId}`);
      return identityAzureAuth;
    },
    onSuccess: (_, { organizationId, identityId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityAzureAuth(identityId) });
    }
  });
};

export const useUpdateIdentityKubernetesAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityKubernetesAuth, object, UpdateIdentityKubernetesAuthDTO>({
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
    onSuccess: (_, { identityId, organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityKubernetesAuth(identityId)
      });
    }
  });
};

export const useDeleteIdentityKubernetesAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityTokenAuth, object, DeleteIdentityKubernetesAuthDTO>({
    mutationFn: async ({ identityId }) => {
      const {
        data: { identityKubernetesAuth }
      } = await apiRequest.delete(`/api/v1/auth/kubernetes-auth/identities/${identityId}`);
      return identityKubernetesAuth;
    },
    onSuccess: (_, { organizationId, identityId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityKubernetesAuth(identityId)
      });
    }
  });
};

export const useAddIdentityTokenAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityTokenAuth, object, AddIdentityTokenAuthDTO>({
    mutationFn: async ({
      identityId,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps
    }) => {
      const {
        data: { identityTokenAuth }
      } = await apiRequest.post<{ identityTokenAuth: IdentityTokenAuth }>(
        `/api/v1/auth/token-auth/identities/${identityId}`,
        {
          accessTokenTTL,
          accessTokenMaxTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps
        }
      );

      return identityTokenAuth;
    },
    onSuccess: (_, { identityId, organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityUniversalAuth(identityId)
      });
    }
  });
};

export const useUpdateIdentityTokenAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityTokenAuth, object, UpdateIdentityTokenAuthDTO>({
    mutationFn: async ({
      identityId,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps
    }) => {
      const {
        data: { identityTokenAuth }
      } = await apiRequest.patch<{ identityTokenAuth: IdentityTokenAuth }>(
        `/api/v1/auth/token-auth/identities/${identityId}`,
        {
          accessTokenTTL,
          accessTokenMaxTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps
        }
      );

      return identityTokenAuth;
    },
    onSuccess: (_, { identityId, organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityUniversalAuth(identityId)
      });
    }
  });
};

export const useDeleteIdentityTokenAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityTokenAuth, object, DeleteIdentityTokenAuthDTO>({
    mutationFn: async ({ identityId }) => {
      const {
        data: { identityTokenAuth }
      } = await apiRequest.delete(`/api/v1/auth/token-auth/identities/${identityId}`);
      return identityTokenAuth;
    },
    onSuccess: (_, { organizationId, identityId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityTokenAuth(identityId) });
    }
  });
};

export const useCreateTokenIdentityTokenAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<CreateTokenIdentityTokenAuthRes, object, CreateTokenIdentityTokenAuthDTO>({
    mutationFn: async ({ identityId, name }) => {
      const { data } = await apiRequest.post<CreateTokenIdentityTokenAuthRes>(
        `/api/v1/auth/token-auth/identities/${identityId}/tokens`,
        {
          name
        }
      );

      return data;
    },
    onSuccess: (_, { identityId }) => {
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityTokensTokenAuth(identityId)
      });
    }
  });
};

export const useUpdateIdentityTokenAuthToken = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityAccessToken, object, UpdateTokenIdentityTokenAuthDTO>({
    mutationFn: async ({ tokenId, name }) => {
      const {
        data: { token }
      } = await apiRequest.patch<{ token: IdentityAccessToken }>(
        `/api/v1/auth/token-auth/tokens/${tokenId}`,
        {
          name
        }
      );

      return token;
    },
    onSuccess: (_, { identityId }) => {
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityTokensTokenAuth(identityId)
      });
    }
  });
};

export const useRevokeIdentityTokenAuthToken = () => {
  const queryClient = useQueryClient();
  return useMutation<RevokeTokenRes, object, RevokeTokenDTO>({
    mutationFn: async ({ tokenId }) => {
      const { data } = await apiRequest.post<RevokeTokenRes>(
        `/api/v1/auth/token-auth/tokens/${tokenId}/revoke`
      );

      return data;
    },
    onSuccess: (_, { identityId }) => {
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityTokensTokenAuth(identityId)
      });
    }
  });
};
