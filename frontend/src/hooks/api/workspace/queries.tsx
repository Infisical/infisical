import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@app/config/request';

import {
  EncryptedSecret
} from '../secrets/types';
import {
  CreateEnvironmentDTO,
  CreateWorkspaceDTO,
  DeleteEnvironmentDTO,
  DeleteWorkspaceDTO,
  GetWsEnvironmentDTO,
  NameWorkspaceSecretsDTO,
  RenameWorkspaceDTO,
  ToggleAutoCapitalizationDTO,
  UpdateEnvironmentDTO,
  Workspace,
  WorkspaceEnv
} from './types';

const workspaceKeys = {
  getWorkspaceById: (workspaceId: string) => [{ workspaceId }, 'workspace'] as const,
  getWorkspaceSecrets: (workspaceId: string) => [{ workspaceId }, 'workspace-secrets'] as const,
  getWorkspaceIndexStatus: (workspaceId: string) => [{ workspaceId}, 'workspace-index-status'] as const,
  getWorkspaceMemberships: (orgId: string) => [{ orgId }, 'workspace-memberships'],
  getAllUserWorkspace: ['workspaces'] as const,
  getUserWsEnvironments: (workspaceId: string) => ['workspace-env', { workspaceId }] as const
};

const fetchWorkspaceById = async (workspaceId: string) => {
  const { data } = await apiRequest.get<{ workspace: Workspace }>(
    `/api/v1/workspace/${workspaceId}`
  );

  return data.workspace;
};

const fetchWorkspaceIndexStatus = async (workspaceId: string) => {
  const { data } = await apiRequest.get<boolean>(
    `/api/v3/workspaces/${workspaceId}/secrets/blind-index-status`
  );

  return data;
}

const fetchWorkspaceSecrets = async (workspaceId: string) => {
  const { data: { secrets } } = await apiRequest.get<{ secrets: EncryptedSecret[] }>(
    `/api/v3/workspaces/${workspaceId}/secrets`
  );
  
  return secrets;
}

const fetchUserWorkspaces = async () => {
  const { data } = await apiRequest.get<{ workspaces: Workspace[] }>('/api/v1/workspace');
  return data.workspaces;
};

export const useGetWorkspaceIndexStatus = (workspaceId: string) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceIndexStatus(workspaceId),
    queryFn: () => fetchWorkspaceIndexStatus(workspaceId),
    enabled: true
  });
}

export const useGetWorkspaceSecrets = (workspaceId: string) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceSecrets(workspaceId),
    queryFn: () => fetchWorkspaceSecrets(workspaceId),
    enabled: true
  })
}

export const useGetWorkspaceById = (workspaceId: string) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceById(workspaceId),
    queryFn: () => fetchWorkspaceById(workspaceId),
    enabled: true
  });
};

export const useGetUserWorkspaces = () =>
  useQuery(workspaceKeys.getAllUserWorkspace, fetchUserWorkspaces);

const fetchUserWorkspaceMemberships = async (orgId: string) => {
  const { data } = await apiRequest.get<Record<string, Workspace[]>>(
    `/api/v1/organization/${orgId}/workspace-memberships`
  );
  return data;
};

const fetchUserWsEnvironments = async (workspaceId: string) => {
  const { data } = await apiRequest.get<{ accessibleEnvironments: WorkspaceEnv[] }>(
    `/api/v2/workspace/${workspaceId}/environments`
  );
  return data.accessibleEnvironments;
};

export const useGetUserWsEnvironments = ({ workspaceId, onSuccess }: GetWsEnvironmentDTO) =>
  useQuery({
    enabled: Boolean(workspaceId),
    onSuccess,
    queryKey: workspaceKeys.getUserWsEnvironments(workspaceId),
    queryFn: () => fetchUserWsEnvironments(workspaceId)
  });

// to get all userids in an org with the workspace they are part of
export const useGetUserWorkspaceMemberships = (orgId: string) =>
  useQuery({
    queryKey: workspaceKeys.getWorkspaceMemberships(orgId),
    queryFn: () => fetchUserWorkspaceMemberships(orgId),
    enabled: Boolean(orgId)
  });

export const useNameWorkspaceSecrets = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, NameWorkspaceSecretsDTO>({
    mutationFn: async ({ workspaceId, secretsToUpdate }) =>
      apiRequest.post(`/api/v3/workspaces/${workspaceId}/secrets/names`, {
        secretsToUpdate
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceIndexStatus(variables.workspaceId));
    }
  });
}

// mutation
export const useCreateWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation<{ data: { workspace: Workspace } }, {}, CreateWorkspaceDTO>({
    mutationFn: async ({ organizationId, workspaceName }) =>
      apiRequest.post('/api/v1/workspace', { workspaceName, organizationId }),
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};

export const useRenameWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, RenameWorkspaceDTO>({
    mutationFn: ({ workspaceID, newWorkspaceName }) =>
      apiRequest.post(`/api/v1/workspace/${workspaceID}/name`, { name: newWorkspaceName }),
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};

export const useToggleAutoCapitalization = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, ToggleAutoCapitalizationDTO>({
    mutationFn: ({ workspaceID, state }) =>
      apiRequest.patch(`/api/v2/workspace/${workspaceID}/auto-capitalization`, {
        autoCapitalization: state
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};

export const useDeleteWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, DeleteWorkspaceDTO>({
    mutationFn: ({ workspaceID }) => apiRequest.delete(`/api/v1/workspace/${workspaceID}`),
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};

export const useCreateWsEnvironment = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, CreateEnvironmentDTO>({
    mutationFn: ({ workspaceID, environmentName, environmentSlug }) =>
      apiRequest.post(`/api/v2/workspace/${workspaceID}/environments`, {
        environmentName,
        environmentSlug
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};

export const useUpdateWsEnvironment = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, UpdateEnvironmentDTO>({
    mutationFn: ({ workspaceID, environmentName, environmentSlug, oldEnvironmentSlug }) =>
      apiRequest.put(`/api/v2/workspace/${workspaceID}/environments`, {
        environmentName,
        environmentSlug,
        oldEnvironmentSlug
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};

export const useDeleteWsEnvironment = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, DeleteEnvironmentDTO>({
    mutationFn: ({ workspaceID, environmentSlug }) =>
      apiRequest.delete(`/api/v2/workspace/${workspaceID}/environments`, {
        data: { environmentSlug }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};
