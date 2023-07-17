import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { secretKeys } from "./queries";
import { TCreateSecretImportDTO, TDeleteSecretImportDTO, TUpdateSecretImportDTO } from "./types";

export const useCreateSecretImport = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TCreateSecretImportDTO>({
    mutationFn: async ({ secretImport, environment, workspaceId, folderId }) => {
      const { data } = await apiRequest.post("/api/v1/secret-imports", {
        secretImport,
        environment,
        workspaceId,
        folderId
      });
      return data;
    },
    onSuccess: (_, { workspaceId, environment, folderId }) => {
      queryClient.invalidateQueries(
        secretKeys.getProjectSecretImports(workspaceId, environment, folderId)
      );
    }
  });
};

export const useUpdateSecretImport = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TUpdateSecretImportDTO>({
    mutationFn: async ({ environment, workspaceId, folderId, secretImports, id }) => {
      const { data } = await apiRequest.put(`/api/v1/secret-imports/${id}`, {
        secretImports,
        environment,
        workspaceId,
        folderId
      });
      return data;
    },
    onSuccess: (_, { workspaceId, environment, folderId }) => {
      queryClient.invalidateQueries(
        secretKeys.getProjectSecretImports(workspaceId, environment, folderId)
      );
    }
  });
};

export const useDeleteSecretImport = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TDeleteSecretImportDTO>({
    mutationFn: async ({ id, secretImportEnv, secretImportPath }) => {
      const { data } = await apiRequest.delete(`/api/v1/secret-imports/${id}`, {
        data: {
          secretImportPath,
          secretImportEnv
        }
      });
      return data;
    },
    onSuccess: (_, { workspaceId, environment, folderId }) => {
      queryClient.invalidateQueries(
        secretKeys.getProjectSecretImports(workspaceId, environment, folderId)
      );
    }
  });
};
