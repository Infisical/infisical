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
  TPamAccount,
  TPamFolder,
  TPamResource,
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
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listResources({ projectId }) });
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
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listAccounts({ projectId }) });
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
  accountPath: string;
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
    mutationFn: async ({ accountId, accountPath, projectId, duration }: TAccessPamAccountDTO) => {
      const { data } = await apiRequest.post<TAccessPamAccountResponse>(
        "/api/v1/pam/accounts/access",
        {
          accountId,
          accountPath,
          projectId,
          duration
        }
      );

      return data;
    }
  });
};

export type TCreateSqlSessionDTO = {
  accountPath: string;
  projectId: string;
  duration: string;
};

export type TCreateSqlSessionResponse = {
  sessionId: string;
  resourceType: string;
  metadata?: {
    username?: string;
    database?: string;
    accountName?: string;
    accountPath?: string;
  };
};

export const useCreateSqlSession = () => {
  return useMutation({
    mutationFn: async ({ accountPath, projectId, duration }: TCreateSqlSessionDTO) => {
      const { data } = await apiRequest.post<TCreateSqlSessionResponse>(
        "/api/v1/pam/sql-proxy/sessions",
        {
          accountPath,
          projectId,
          duration
        }
      );

      return data;
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
