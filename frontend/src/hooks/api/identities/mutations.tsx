import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { projectIdentityQuery, projectKeys } from "@app/hooks/api";

import { organizationKeys } from "../organization/queries";
import { identitiesKeys } from "./queries";
import {
  AddIdentityAliCloudAuthDTO,
  AddIdentityAwsAuthDTO,
  AddIdentityAzureAuthDTO,
  AddIdentityGcpAuthDTO,
  AddIdentityJwtAuthDTO,
  AddIdentityKubernetesAuthDTO,
  AddIdentityLdapAuthDTO,
  AddIdentityOciAuthDTO,
  AddIdentityOidcAuthDTO,
  AddIdentityTlsCertAuthDTO,
  AddIdentityTokenAuthDTO,
  AddIdentityUniversalAuthDTO,
  ClearIdentityLdapAuthLockoutsDTO,
  ClearIdentityUniversalAuthLockoutsDTO,
  ClientSecretData,
  CreateIdentityUniversalAuthClientSecretDTO,
  CreateIdentityUniversalAuthClientSecretRes,
  CreateTokenIdentityTokenAuthDTO,
  CreateTokenIdentityTokenAuthRes,
  DeleteIdentityAliCloudAuthDTO,
  DeleteIdentityAwsAuthDTO,
  DeleteIdentityAzureAuthDTO,
  DeleteIdentityGcpAuthDTO,
  DeleteIdentityJwtAuthDTO,
  DeleteIdentityKubernetesAuthDTO,
  DeleteIdentityLdapAuthDTO,
  DeleteIdentityOciAuthDTO,
  DeleteIdentityOidcAuthDTO,
  DeleteIdentityTlsCertAuthDTO,
  DeleteIdentityTokenAuthDTO,
  DeleteIdentityUniversalAuthClientSecretDTO,
  DeleteIdentityUniversalAuthDTO,
  IdentityAccessToken,
  IdentityAliCloudAuth,
  IdentityAwsAuth,
  IdentityAzureAuth,
  IdentityGcpAuth,
  IdentityJwtAuth,
  IdentityKubernetesAuth,
  IdentityLdapAuth,
  IdentityOciAuth,
  IdentityOidcAuth,
  IdentityTlsCertAuth,
  IdentityTokenAuth,
  IdentityUniversalAuth,
  RevokeTokenDTO,
  RevokeTokenRes,
  UpdateIdentityAliCloudAuthDTO,
  UpdateIdentityAwsAuthDTO,
  UpdateIdentityAzureAuthDTO,
  UpdateIdentityGcpAuthDTO,
  UpdateIdentityJwtAuthDTO,
  UpdateIdentityKubernetesAuthDTO,
  UpdateIdentityLdapAuthDTO,
  UpdateIdentityOciAuthDTO,
  UpdateIdentityOidcAuthDTO,
  UpdateIdentityTlsCertAuthDTO,
  UpdateIdentityTokenAuthDTO,
  UpdateIdentityUniversalAuthDTO,
  UpdateTokenIdentityTokenAuthDTO
} from "./types";

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
      accessTokenTrustedIps,
      lockoutEnabled,
      lockoutThreshold,
      lockoutDurationSeconds,
      lockoutCounterResetSeconds
    }) => {
      const {
        data: { identityUniversalAuth }
      } = await apiRequest.post(`/api/v1/auth/universal-auth/identities/${identityId}`, {
        clientSecretTrustedIps,
        accessTokenTTL,
        accessTokenMaxTTL,
        accessTokenNumUsesLimit,
        accessTokenTrustedIps,
        lockoutEnabled,
        lockoutThreshold,
        lockoutDurationSeconds,
        lockoutCounterResetSeconds
      });
      return identityUniversalAuth;
    },
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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
      accessTokenTrustedIps,
      accessTokenPeriod,
      lockoutEnabled,
      lockoutThreshold,
      lockoutDurationSeconds,
      lockoutCounterResetSeconds
    }) => {
      const {
        data: { identityUniversalAuth }
      } = await apiRequest.patch(`/api/v1/auth/universal-auth/identities/${identityId}`, {
        clientSecretTrustedIps,
        accessTokenTTL,
        accessTokenMaxTTL,
        accessTokenNumUsesLimit,
        accessTokenTrustedIps,
        accessTokenPeriod,
        lockoutEnabled,
        lockoutThreshold,
        lockoutDurationSeconds,
        lockoutCounterResetSeconds
      });
      return identityUniversalAuth;
    },
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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
    onSuccess: (_, { organizationId, identityId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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

export const useClearIdentityUniversalAuthLockouts = () => {
  const queryClient = useQueryClient();
  return useMutation<number, object, ClearIdentityUniversalAuthLockoutsDTO>({
    mutationFn: async ({ identityId }) => {
      const {
        data: { deleted }
      } = await apiRequest.post<{ deleted: number }>(
        `/api/v1/auth/universal-auth/identities/${identityId}/clear-lockouts`
      );
      return deleted;
    },
    onSuccess: (_, { identityId }) => {
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityUniversalAuth(identityId)
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
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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
    onSuccess: (_, { organizationId, identityId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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
    onSuccess: (_, { organizationId, identityId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityAwsAuth(identityId) });
    }
  });
};

export const useAddIdentityOciAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityOciAuth, object, AddIdentityOciAuthDTO>({
    mutationFn: async ({
      identityId,
      tenancyOcid,
      allowedUsernames,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps
    }) => {
      const {
        data: { identityOciAuth }
      } = await apiRequest.post<{ identityOciAuth: IdentityOciAuth }>(
        `/api/v1/auth/oci-auth/identities/${identityId}`,
        {
          tenancyOcid,
          allowedUsernames,
          accessTokenTTL,
          accessTokenMaxTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps
        }
      );

      return identityOciAuth;
    },
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityOciAuth(identityId) });
    }
  });
};

export const useUpdateIdentityOciAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityOciAuth, object, UpdateIdentityOciAuthDTO>({
    mutationFn: async ({
      identityId,
      tenancyOcid,
      allowedUsernames,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps
    }) => {
      const {
        data: { identityOciAuth }
      } = await apiRequest.patch<{ identityOciAuth: IdentityOciAuth }>(
        `/api/v1/auth/oci-auth/identities/${identityId}`,
        {
          tenancyOcid,
          allowedUsernames,
          accessTokenTTL,
          accessTokenMaxTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps
        }
      );

      return identityOciAuth;
    },
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityOciAuth(identityId) });
    }
  });
};

export const useDeleteIdentityOciAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityOciAuth, object, DeleteIdentityOciAuthDTO>({
    mutationFn: async ({ identityId }) => {
      const {
        data: { identityOciAuth }
      } = await apiRequest.delete(`/api/v1/auth/oci-auth/identities/${identityId}`);
      return identityOciAuth;
    },
    onSuccess: (_, { organizationId, identityId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityOciAuth(identityId) });
    }
  });
};

export const useAddIdentityAliCloudAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityAliCloudAuth, object, AddIdentityAliCloudAuthDTO>({
    mutationFn: async ({
      identityId,
      allowedArns,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps
    }) => {
      const {
        data: { identityAliCloudAuth }
      } = await apiRequest.post<{ identityAliCloudAuth: IdentityAliCloudAuth }>(
        `/api/v1/auth/alicloud-auth/identities/${identityId}`,
        {
          allowedArns,
          accessTokenTTL,
          accessTokenMaxTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps
        }
      );

      return identityAliCloudAuth;
    },
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityAliCloudAuth(identityId)
      });
    }
  });
};

export const useUpdateIdentityAliCloudAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityAliCloudAuth, object, UpdateIdentityAliCloudAuthDTO>({
    mutationFn: async ({
      identityId,
      allowedArns,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps
    }) => {
      const {
        data: { identityAliCloudAuth }
      } = await apiRequest.patch<{ identityAliCloudAuth: IdentityAliCloudAuth }>(
        `/api/v1/auth/alicloud-auth/identities/${identityId}`,
        {
          allowedArns,
          accessTokenTTL,
          accessTokenMaxTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps
        }
      );

      return identityAliCloudAuth;
    },
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityAliCloudAuth(identityId)
      });
    }
  });
};

export const useDeleteIdentityAliCloudAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityAliCloudAuth, object, DeleteIdentityAliCloudAuthDTO>({
    mutationFn: async ({ identityId }) => {
      const {
        data: { identityAliCloudAuth }
      } = await apiRequest.delete(`/api/v1/auth/alicloud-auth/identities/${identityId}`);
      return identityAliCloudAuth;
    },
    onSuccess: (_, { organizationId, identityId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityAliCloudAuth(identityId)
      });
    }
  });
};

export const useAddIdentityTlsCertAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityTlsCertAuth, object, AddIdentityTlsCertAuthDTO>({
    mutationFn: async ({
      identityId,
      allowedCommonNames,
      caCertificate,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps
    }) => {
      const {
        data: { identityTlsCertAuth }
      } = await apiRequest.post<{ identityTlsCertAuth: IdentityTlsCertAuth }>(
        `/api/v1/auth/tls-cert-auth/identities/${identityId}`,
        {
          allowedCommonNames,
          caCertificate,
          accessTokenTTL,
          accessTokenMaxTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps
        }
      );

      return identityTlsCertAuth;
    },
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityTlsCertAuth(identityId)
      });
    }
  });
};

export const useUpdateIdentityTlsCertAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityTlsCertAuth, object, UpdateIdentityTlsCertAuthDTO>({
    mutationFn: async ({
      identityId,
      allowedCommonNames,
      caCertificate,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps
    }) => {
      const {
        data: { identityTlsCertAuth }
      } = await apiRequest.patch<{ identityTlsCertAuth: IdentityTlsCertAuth }>(
        `/api/v1/auth/tls-cert-auth/identities/${identityId}`,
        {
          caCertificate,
          allowedCommonNames,
          accessTokenTTL,
          accessTokenMaxTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps
        }
      );

      return identityTlsCertAuth;
    },
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityTlsCertAuth(identityId)
      });
    }
  });
};

export const useDeleteIdentityTlsCertAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityTlsCertAuth, object, DeleteIdentityTlsCertAuthDTO>({
    mutationFn: async ({ identityId }) => {
      const {
        data: { identityTlsCertAuth }
      } = await apiRequest.delete(`/api/v1/auth/tls-cert-auth/identities/${identityId}`);
      return identityTlsCertAuth;
    },
    onSuccess: (_, { organizationId, identityId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityTlsCertAuth(identityId)
      });
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
      claimMetadataMapping,
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
          accessTokenTrustedIps,
          claimMetadataMapping
        }
      );

      return identityOidcAuth;
    },
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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
      claimMetadataMapping,
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
          accessTokenTrustedIps,
          claimMetadataMapping
        }
      );

      return identityOidcAuth;
    },
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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
    onSuccess: (_, { organizationId, identityId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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
    onSuccess: (_, { organizationId, identityId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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
      accessTokenTrustedIps,
      gatewayId,
      tokenReviewMode
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
          accessTokenTrustedIps,
          gatewayId,
          tokenReviewMode
        }
      );

      return identityKubernetesAuth;
    },
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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
    onSuccess: (_, { organizationId, identityId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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
      accessTokenTrustedIps,
      gatewayId,
      tokenReviewMode
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
          accessTokenTrustedIps,
          gatewayId,
          tokenReviewMode
        }
      );

      return identityKubernetesAuth;
    },
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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
    onSuccess: (_, { organizationId, identityId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityTokenAuth(identityId)
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
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityTokenAuth(identityId)
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
    onSuccess: (_, { organizationId, identityId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
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

export const useAddIdentityLdapAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityLdapAuth, object, AddIdentityLdapAuthDTO>({
    mutationFn: async ({
      identityId,
      templateId,
      url,
      bindDN,
      bindPass,
      searchBase,
      searchFilter,
      ldapCaCertificate,
      allowedFields,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps,
      lockoutEnabled,
      lockoutThreshold,
      lockoutDurationSeconds,
      lockoutCounterResetSeconds
    }) => {
      const { data } = await apiRequest.post<{ identityLdapAuth: IdentityLdapAuth }>(
        `/api/v1/auth/ldap-auth/identities/${identityId}`,
        {
          templateId,
          url,
          bindDN,
          bindPass,
          searchBase,
          searchFilter,
          ldapCaCertificate,
          allowedFields,
          accessTokenTTL,
          accessTokenMaxTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps,
          lockoutEnabled,
          lockoutThreshold,
          lockoutDurationSeconds,
          lockoutCounterResetSeconds
        }
      );
      return data.identityLdapAuth;
    },
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityLdapAuth(identityId)
      });
    }
  });
};

export const useUpdateIdentityLdapAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityLdapAuth, object, UpdateIdentityLdapAuthDTO>({
    mutationFn: async ({
      identityId,
      templateId,
      url,
      bindDN,
      bindPass,
      searchBase,
      searchFilter,
      ldapCaCertificate,
      allowedFields,
      accessTokenTTL,
      accessTokenMaxTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps,
      lockoutEnabled,
      lockoutThreshold,
      lockoutDurationSeconds,
      lockoutCounterResetSeconds
    }) => {
      const { data } = await apiRequest.patch<{ identityLdapAuth: IdentityLdapAuth }>(
        `/api/v1/auth/ldap-auth/identities/${identityId}`,
        {
          templateId,
          url,
          bindDN,
          bindPass,
          searchBase,
          searchFilter,
          ldapCaCertificate,
          allowedFields,
          accessTokenTTL,
          accessTokenMaxTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps,
          lockoutEnabled,
          lockoutThreshold,
          lockoutDurationSeconds,
          lockoutCounterResetSeconds
        }
      );
      return data.identityLdapAuth;
    },
    onSuccess: (_, { identityId, organizationId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityLdapAuth(identityId)
      });
    }
  });
};

export const useDeleteIdentityLdapAuth = () => {
  const queryClient = useQueryClient();
  return useMutation<IdentityLdapAuth, object, DeleteIdentityLdapAuthDTO>({
    mutationFn: async ({ identityId }) => {
      const { data } = await apiRequest.delete(`/api/v1/auth/ldap-auth/identities/${identityId}`);
      return data.identityLdapAuth;
    },
    onSuccess: (_, { organizationId, identityId, projectId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
        });
      }
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.getProjectIdentityMemberships(projectId)
        });
        queryClient.invalidateQueries({
          queryKey: projectIdentityQuery.getByIdKey({ identityId, projectId })
        });
      }
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityLdapAuth(identityId)
      });
    }
  });
};

export const useClearIdentityLdapAuthLockouts = () => {
  const queryClient = useQueryClient();
  return useMutation<number, object, ClearIdentityLdapAuthLockoutsDTO>({
    mutationFn: async ({ identityId }) => {
      const {
        data: { deleted }
      } = await apiRequest.post<{ deleted: number }>(
        `/api/v1/auth/ldap-auth/identities/${identityId}/clear-lockouts`
      );
      return deleted;
    },
    onSuccess: (_, { identityId }) => {
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityLdapAuth(identityId)
      });
    }
  });
};
