import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@app/config/request';

import {
  CreateEnvironmentDTO,
  DeleteEnvironmentDTO,
  DeleteWorkspaceDTO,
  RenameWorkspaceDTO,
  ToggleAutoCapitalizationDTO,
  UpdateEnvironmentDTO,
  Workspace
} from './types';

const workspaceKeys = {
  getAllUserWorkspace: ['workspaces'] as const
};

const fetchUserWorkspaces = async () => {
  const { data } = await apiRequest.get<{ workspaces: Workspace[] }>('/api/v1/workspace');
  return data.workspaces;
};

export const useGetUserWorkspaces = () =>
  useQuery(workspaceKeys.getAllUserWorkspace, fetchUserWorkspaces);

// mutation
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
      apiRequest.post(`/api/v2/workspace/${workspaceID}/settings`, { autoCapitalization: state }),
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
