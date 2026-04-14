import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { dashboardKeys } from "@app/hooks/api/dashboard/queries";

import { secretImportKeys } from "./queries";
import {
  TCreateSecretImportDTO,
  TDeleteSecretImportDTO,
  TResyncSecretReplicationDTO,
  TUpdateSecretImportDTO
} from "./types";

export const useCreateSecretImport = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TCreateSecretImportDTO>({
    mutationFn: async ({ import: secretImport, environment, isReplication, projectId, path }) => {
      const { data } = await apiRequest.post("/api/v2/secret-imports", {
        import: secretImport,
        environment,
        projectId,
        path,
        isReplication
      });
      return data;
    },
    onSuccess: (_, { environment, projectId, path }) => {
      queryClient.invalidateQueries({
        queryKey: secretImportKeys.getProjectSecretImports({ projectId, environment, path })
      });
      queryClient.invalidateQueries({
        queryKey: secretImportKeys.getSecretImportSecrets({ projectId, environment, path })
      });
      queryClient.invalidateQueries({
        queryKey: secretImportKeys.getImportedFoldersAllEnvs({
          projectId,
          environment,
          path: path ?? "/"
        })
      });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath: path ?? "/" })
      });
    }
  });
};

export const useUpdateSecretImport = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TUpdateSecretImportDTO>({
    mutationFn: async ({ environment, import: secretImports, projectId, path, id }) => {
      const { data } = await apiRequest.patch(`/api/v2/secret-imports/${id}`, {
        import: secretImports,
        environment,
        path,
        projectId
      });
      return data;
    },
    onSuccess: (_, { environment, projectId, path }) => {
      queryClient.invalidateQueries({
        queryKey: secretImportKeys.getProjectSecretImports({ projectId, environment, path })
      });
      queryClient.invalidateQueries({
        queryKey: secretImportKeys.getSecretImportSecrets({ projectId, environment, path })
      });
      queryClient.invalidateQueries({
        queryKey: secretImportKeys.getImportedFoldersAllEnvs({
          projectId,
          environment,
          path: path ?? "/"
        })
      });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath: path ?? "/" })
      });
    }
  });
};

export const useResyncSecretReplication = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TResyncSecretReplicationDTO>({
    mutationFn: async ({ environment, projectId, path, id }) => {
      const { data } = await apiRequest.post(`/api/v2/secret-imports/${id}/replication-resync`, {
        environment,
        path,
        projectId
      });
      return data;
    },
    onSuccess: (_, { environment, projectId, path }) => {
      queryClient.invalidateQueries({
        queryKey: secretImportKeys.getProjectSecretImports({ projectId, environment, path })
      });
      queryClient.invalidateQueries({
        queryKey: secretImportKeys.getSecretImportSecrets({ projectId, environment, path })
      });
      queryClient.invalidateQueries({
        queryKey: secretImportKeys.getImportedFoldersAllEnvs({
          projectId,
          environment,
          path: path ?? "/"
        })
      });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath: path ?? "/" })
      });
    }
  });
};

export const useDeleteSecretImport = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TDeleteSecretImportDTO>({
    mutationFn: async ({ id, projectId, path, environment }) => {
      const { data } = await apiRequest.delete(`/api/v2/secret-imports/${id}`, {
        data: {
          projectId,
          path,
          environment
        }
      });
      return data;
    },
    onSuccess: (_, { projectId, environment, path }) => {
      queryClient.invalidateQueries({
        queryKey: secretImportKeys.getProjectSecretImports({ projectId, environment, path })
      });
      queryClient.invalidateQueries({
        queryKey: secretImportKeys.getSecretImportSecrets({ projectId, environment, path })
      });
      queryClient.invalidateQueries({
        queryKey: secretImportKeys.getImportedFoldersAllEnvs({
          projectId,
          environment,
          path: path ?? "/"
        })
      });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath: path ?? "/" })
      });
    }
  });
};
