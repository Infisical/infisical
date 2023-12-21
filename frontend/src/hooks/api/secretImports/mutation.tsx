import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { secretImportKeys } from "./queries";
import { TCreateSecretImportDTO, TDeleteSecretImportDTO, TUpdateSecretImportDTO } from "./types";

export const useCreateSecretImport = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TCreateSecretImportDTO>({
    mutationFn: async ({ import: secretImport, environment, projectId, path }) => {
      const { data } = await apiRequest.post("/api/v1/secret-imports", {
        import: secretImport,
        environment,
        projectId,
        path
      });
      return data;
    },
    onSuccess: (_, { environment, projectId, path }) => {
      queryClient.invalidateQueries(
        secretImportKeys.getProjectSecretImports({ projectId, environment, path })
      );
      queryClient.invalidateQueries(
        secretImportKeys.getSecretImportSecrets({ projectId, environment, path })
      );
    }
  });
};

export const useUpdateSecretImport = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TUpdateSecretImportDTO>({
    mutationFn: async ({ environment, import: secretImports, projectId, path, id }) => {
      const { data } = await apiRequest.patch(`/api/v1/secret-imports/${id}`, {
        import: secretImports,
        environment,
        path,
        projectId
      });
      return data;
    },
    onSuccess: (_, { environment, projectId, path }) => {
      queryClient.invalidateQueries(
        secretImportKeys.getProjectSecretImports({ projectId, path, environment })
      );
      queryClient.invalidateQueries(
        secretImportKeys.getSecretImportSecrets({ environment, path, projectId })
      );
    }
  });
};

export const useDeleteSecretImport = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TDeleteSecretImportDTO>({
    mutationFn: async ({ id, projectId, path, environment }) => {
      const { data } = await apiRequest.delete(`/api/v1/secret-imports/${id}`, {
        data: {
          projectId,
          path,
          environment
        }
      });
      return data;
    },
    onSuccess: (_, { projectId, environment, path }) => {
      queryClient.invalidateQueries(
        secretImportKeys.getProjectSecretImports({ projectId, environment, path })
      );
      queryClient.invalidateQueries(
        secretImportKeys.getSecretImportSecrets({ projectId, environment, path })
      );
    }
  });
};
