import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { pamKeys } from "./queries";
import {
  TCreatePamAccountDTO,
  TCreatePamFolderDTO,
  TCreatePamResourceDTO,
  TCreatePamRotationRuleDTO,
  TDeletePamAccountDTO,
  TDeletePamFolderDTO,
  TDeletePamResourceDTO,
  TDeletePamRotationRuleDTO,
  TPamAccount,
  TPamFolder,
  TPamResource,
  TPamRotationRule,
  TReorderPamRotationRulesDTO,
  TUpdatePamAccountDTO,
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
      isEnabled
    }: {
      accountId: string;
      dependencyId: string;
      isEnabled: boolean;
    }) => {
      const { data } = await apiRequest.patch(
        `/api/v1/pam/accounts/${accountId}/dependencies/${dependencyId}`,
        { isEnabled }
      );

      return data.dependency;
    },
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.accountDependencies(accountId) });
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
      const { data } = await apiRequest.post<{ success: boolean; accountId: string }>(
        `/api/v1/pam/accounts/${accountId}/rotate`
      );
      return data;
    },
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.getAccount(accountId) });
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
