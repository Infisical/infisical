import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@app/config/request';

import {
  CreateEnvironmentDTO,
  CreateWorkspaceDTO,
  DeleteEnvironmentDTO,
  DeleteWorkspaceDTO,
  RenameWorkspaceDTO,
  ToggleAutoCapitalizationDTO,
  UpdateEnvironmentDTO,
  Workspace
} from './types';

const workspaceKeys = {
  getWorkspaceById: (workspaceId: string) => [{ workspaceId }, 'workspace'] as const,
  getWorkspaceMemberships: (orgId: string) => [{ orgId }, 'workspace-memberships'],
  getAllUserWorkspace: ['workspaces'] as const
};

const fetchWorkspaceById = async (workspaceId: string) => {
  const { data } = await apiRequest.get<{ workspace: Workspace }>(
    `/api/v1/workspace/${workspaceId}`
  );
  return data.workspace;
};

const fetchUserWorkspaces = async () => {
  const { data } = await apiRequest.get<{ workspaces: Workspace[] }>('/api/v1/workspace');
  return data.workspaces;
};

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

// to get all userids in an org with the workspace they are part of
export const useGetUserWorkspaceMemberships = (orgId: string) =>
  useQuery({
    queryKey: workspaceKeys.getWorkspaceMemberships(orgId),
    queryFn: () => fetchUserWorkspaceMemberships(orgId),
    enabled: Boolean(orgId)
  });

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
