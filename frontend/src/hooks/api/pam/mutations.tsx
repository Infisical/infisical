import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { pamKeys } from "./queries";
import {
  TCreatePamAccountDTO,
  TCreatePamAccountPolicyDTO,
  TCreatePamFolderDTO,
  TCreatePamResourceDTO,
  TCreatePamRotationRuleDTO,
  TDeletePamAccountDTO,
  TDeletePamAccountPolicyDTO,
  TDeletePamFolderDTO,
  TDeletePamResourceDTO,
  TDeletePamRotationRuleDTO,
  TPamAccount,
  TPamAccountPolicy,
  TPamFolder,
  TPamResource,
  TPamRotationRule,
  TPamSession,
  TReorderPamRotationRulesDTO,
  TUpdatePamAccountDTO,
  TUpdatePamAccountPolicyDTO,
  TUpdatePamFolderDTO,
  TUpdatePamResourceDTO,
  TUpdatePamRotationRuleDTO
} from "./types";

// Resources
export const useCreatePamResource = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resourceType, ...params }: TCreatePamResourceDTO) => {
      const { data } = await apiRequest.post<{ resource: TPamResource }>(
        `/api/v1/pam/resources/${resourceType}`,
        params
      );

      return data.resource;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listResources({ projectId }) });
    }
  });
};

export const useUpdatePamResource = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resourceId, resourceType, ...params }: TUpdatePamResourceDTO) => {
      const { data } = await apiRequest.patch<{ resource: TPamResource }>(
        `/api/v1/pam/resources/${resourceType}/${resourceId}`,
        params
      );

      return data.resource;
    },
    onSuccess: ({ projectId }, { resourceId, resourceType }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listResources({ projectId }) });
      queryClient.invalidateQueries({
        queryKey: pamKeys.getResource(resourceType, resourceId)
      });
    }
  });
};

export const useDeletePamResource = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resourceId, resourceType }: TDeletePamResourceDTO) => {
      const { data } = await apiRequest.delete<{ resource: TPamResource }>(
        `/api/v1/pam/resources/${resourceType}/${resourceId}`
      );

      return data.resource;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listResources({ projectId }) });
    }
  });
};

// Favorites
export type TSetPamResourceFavoriteDTO = {
  projectId: string;
  resourceId: string;
  isFavorite: boolean;
};

export const useSetPamResourceFavorite = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, resourceId, isFavorite }: TSetPamResourceFavoriteDTO) => {
      await apiRequest.put("/api/v1/pam/resources/favorites", {
        projectId,
        resourceId,
        isFavorite
      });
    },
    onMutate: async ({ projectId, resourceId, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey: pamKeys.listResources({ projectId }) });

      const previousQueries = queryClient.getQueriesData<{
        resources: TPamResource[];
        totalCount: number;
      }>({
        queryKey: pamKeys.listResources({ projectId })
      });

      queryClient.setQueriesData<{ resources: TPamResource[]; totalCount: number }>(
        { queryKey: pamKeys.listResources({ projectId }) },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            resources: old.resources.map((r) => (r.id === resourceId ? { ...r, isFavorite } : r))
          };
        }
      );

      return { previousQueries };
    },
    onError: (_err, _vars, context) => {
      context?.previousQueries.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
    },
    onSettled: (_data, _err, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listResources({ projectId }) });
    }
  });
};

// Accounts
export const useCreatePamAccount = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resourceType, ...params }: TCreatePamAccountDTO) => {
      const { data } = await apiRequest.post<{ account: TPamAccount }>(
        `/api/v1/pam/accounts/${resourceType}`,
        params
      );

      return data.account;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listAccounts({ projectId }) });
    }
  });
};

export const useUpdatePamAccount = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resourceType, accountId, ...params }: TUpdatePamAccountDTO) => {
      const { data } = await apiRequest.patch<{ account: TPamAccount }>(
        `/api/v1/pam/accounts/${resourceType}/${accountId}`,
        params
      );

      return data.account;
    },
    onSuccess: ({ projectId }, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listAccounts({ projectId }) });
      queryClient.invalidateQueries({ queryKey: pamKeys.getAccount(accountId) });
    }
  });
};

export const useDeletePamAccount = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resourceType, accountId }: TDeletePamAccountDTO) => {
      const { data } = await apiRequest.delete<{ account: TPamAccount }>(
        `/api/v1/pam/accounts/${resourceType}/${accountId}`
      );

      return data.account;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listAccounts({ projectId }) });
    }
  });
};

export type TAccessPamAccountDTO = {
  accountId: string;
  resourceName: string;
  accountName: string;
  projectId: string;
  duration: string;
};

export type TAccessPamAccountResponse = {
  sessionId: string;
  resourceType: string;
  consoleUrl?: string;
  metadata?: Record<string, string | undefined>;
  relayClientCertificate?: string;
  relayClientPrivateKey?: string;
  relayServerCertificateChain?: string;
  gatewayClientCertificate?: string;
  gatewayClientPrivateKey?: string;
  gatewayServerCertificateChain?: string;
  relayHost?: string;
};

export const useAccessPamAccount = () => {
  return useMutation({
    mutationFn: async ({
      accountId,
      resourceName,
      accountName,
      projectId,
      duration
    }: TAccessPamAccountDTO) => {
      const { data } = await apiRequest.post<TAccessPamAccountResponse>(
        "/api/v1/pam/accounts/access",
        {
          accountId,
          resourceName,
          accountName,
          projectId,
          duration
        }
      );

      return data;
    }
  });
};

// Account Dependencies
export const useTogglePamAccountDependency = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accountId,
      dependencyId,
      isRotationSyncEnabled
    }: {
      accountId: string;
      dependencyId: string;
      isRotationSyncEnabled: boolean;
    }) => {
      const { data } = await apiRequest.patch(
        `/api/v1/pam/accounts/${accountId}/dependencies/${dependencyId}`,
        { isRotationSyncEnabled }
      );

      return data.dependency;
    },
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.accountDependencies(accountId) });
      queryClient.invalidateQueries({ queryKey: pamKeys.allResourceDependencies() });
    }
  });
};

export const useDeletePamAccountDependency = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accountId,
      dependencyId
    }: {
      accountId: string;
      dependencyId: string;
    }) => {
      const { data } = await apiRequest.delete(
        `/api/v1/pam/accounts/${accountId}/dependencies/${dependencyId}`
      );

      return data.dependency;
    },
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.accountDependencies(accountId) });
      queryClient.invalidateQueries({ queryKey: pamKeys.allResourceDependencies() });
    }
  });
};

// Rotation Rules
export const useCreatePamRotationRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resourceId, ...params }: TCreatePamRotationRuleDTO) => {
      const { data } = await apiRequest.post<{ rule: TPamRotationRule }>(
        `/api/v1/pam/resources/${resourceId}/rotation-rules`,
        params
      );
      return data.rule;
    },
    onSuccess: (_, { resourceId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.rotationRules(resourceId) });
    }
  });
};

export const useUpdatePamRotationRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resourceId, ruleId, ...params }: TUpdatePamRotationRuleDTO) => {
      const { data } = await apiRequest.patch<{ rule: TPamRotationRule }>(
        `/api/v1/pam/resources/${resourceId}/rotation-rules/${ruleId}`,
        params
      );
      return data.rule;
    },
    onSuccess: (_, { resourceId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.rotationRules(resourceId) });
    }
  });
};

export const useDeletePamRotationRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resourceId, ruleId }: TDeletePamRotationRuleDTO) => {
      const { data } = await apiRequest.delete<{ rule: TPamRotationRule }>(
        `/api/v1/pam/resources/${resourceId}/rotation-rules/${ruleId}`
      );
      return data.rule;
    },
    onSuccess: (_, { resourceId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.rotationRules(resourceId) });
    }
  });
};

export const useReorderPamRotationRules = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resourceId, ruleIds }: TReorderPamRotationRulesDTO) => {
      const { data } = await apiRequest.put<{ rules: TPamRotationRule[] }>(
        `/api/v1/pam/resources/${resourceId}/rotation-rules/reorder`,
        { ruleIds }
      );
      return data.rules;
    },
    onSuccess: (_, { resourceId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.rotationRules(resourceId) });
    }
  });
};

// Manual Rotation
export const useManualRotateAccount = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId }: { accountId: string }) => {
      const { data } = await apiRequest.post<{ account: TPamAccount }>(
        `/api/v1/pam/accounts/${accountId}/rotate`
      );
      return data.account;
    },
    onSuccess: (account) => {
      queryClient.setQueryData(pamKeys.getAccount(account.id), account);
      queryClient.invalidateQueries({
        queryKey: pamKeys.listAccounts({ projectId: account.projectId })
      });
    }
  });
};

// Folders
export const useCreatePamFolder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TCreatePamFolderDTO) => {
      const { data } = await apiRequest.post<{ folder: TPamFolder }>("/api/v1/pam/folders", params);

      return data.folder;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listAccounts({ projectId }) });
    }
  });
};

export const useUpdatePamFolder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ folderId, ...params }: TUpdatePamFolderDTO) => {
      const { data } = await apiRequest.patch<{ folder: TPamFolder }>(
        `/api/v1/pam/folders/${folderId}`,
        params
      );

      return data.folder;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listAccounts({ projectId }) });
    }
  });
};

export const useDeletePamFolder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ folderId }: TDeletePamFolderDTO) => {
      const { data } = await apiRequest.delete<{ folder: TPamFolder }>(
        `/api/v1/pam/folders/${folderId}`
      );

      return data.folder;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listAccounts({ projectId }) });
    }
  });
};

export const useTerminatePamSession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId }: { sessionId: string; projectId: string }) => {
      const { data } = await apiRequest.post<{ session: TPamSession }>(
        `/api/v1/pam/sessions/${sessionId}/terminate`
      );

      return data.session;
    },
    onSuccess: (_, { projectId, sessionId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listSessions(projectId) });
      queryClient.invalidateQueries({ queryKey: pamKeys.getSession(sessionId) });
    }
  });
};

// Account Policies
export const useCreatePamAccountPolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TCreatePamAccountPolicyDTO) => {
      const { data } = await apiRequest.post<{ policy: TPamAccountPolicy }>(
        "/api/v1/pam/account-policies",
        params
      );

      return data.policy;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listAccountPolicies(projectId) });
    }
  });
};

export const useUpdatePamAccountPolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ policyId, ...params }: TUpdatePamAccountPolicyDTO) => {
      const { data } = await apiRequest.patch<{ policy: TPamAccountPolicy }>(
        `/api/v1/pam/account-policies/${policyId}`,
        params
      );

      return data.policy;
    },
    onSuccess: ({ projectId, id }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listAccountPolicies(projectId) });
      queryClient.invalidateQueries({ queryKey: pamKeys.getAccountPolicy(id) });
    }
  });
};

export const useDeletePamAccountPolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ policyId }: TDeletePamAccountPolicyDTO) => {
      const { data } = await apiRequest.delete<{ policy: TPamAccountPolicy }>(
        `/api/v1/pam/account-policies/${policyId}`
      );

      return data.policy;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listAccountPolicies(projectId) });
    }
  });
};
