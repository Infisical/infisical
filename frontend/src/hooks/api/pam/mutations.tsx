import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { pamKeys } from "./queries";
import {
  TCreatePamAccountDTO,
  TCreatePamFolderDTO,
  TCreatePamResourceDTO,
  TDeletePamAccountDTO,
  TDeletePamFolderDTO,
  TDeletePamResourceDTO,
  TMcpServerConfiguration,
  TMcpServerOAuthCallbackDTO,
  TPamAccount,
  TPamFolder,
  TPamResource,
  TUpdateMcpServerConfigDTO,
  TUpdatePamAccountDTO,
  TUpdatePamFolderDTO,
  TUpdatePamResourceDTO
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
      queryClient.invalidateQueries({ queryKey: pamKeys.listResources(projectId) });
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
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listResources(projectId) });
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
      queryClient.invalidateQueries({ queryKey: pamKeys.listResources(projectId) });
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
      queryClient.invalidateQueries({ queryKey: pamKeys.listAccounts(projectId) });
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
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listAccounts(projectId) });
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
      queryClient.invalidateQueries({ queryKey: pamKeys.listAccounts(projectId) });
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
      queryClient.invalidateQueries({ queryKey: pamKeys.listAccounts(projectId) });
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
      queryClient.invalidateQueries({ queryKey: pamKeys.listAccounts(projectId) });
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
      queryClient.invalidateQueries({ queryKey: pamKeys.listAccounts(projectId) });
    }
  });
};

// MCP Server OAuth

export const useMcpServerOAuthCallback = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, code }: TMcpServerOAuthCallbackDTO) => {
      const { data } = await apiRequest.post<{ message: string }>(
        `/api/v1/pam/accounts/mcp/${accountId}/oauth/callback`,
        { code }
      );

      return data;
    },
    onSuccess: (_, variables) => {
      // Invalidate the accounts query if projectId is provided
      if (variables.projectId) {
        queryClient.invalidateQueries({ queryKey: pamKeys.listAccounts(variables.projectId) });
      }
    }
  });
};

export const useUpdateMcpServerConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, config }: TUpdateMcpServerConfigDTO) => {
      const { data } = await apiRequest.post<{ config: TMcpServerConfiguration }>(
        `/api/v1/pam/accounts/mcp/${accountId}/config`,
        { config }
      );

      return data.config;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.getMcpConfig(variables.accountId) });
    }
  });
};
