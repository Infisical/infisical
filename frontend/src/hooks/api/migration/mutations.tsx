import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace";

export const useImportEnvKey = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ file, decryptionKey }: { file: File; decryptionKey: string }) => {
      const formData = new FormData();

      formData.append("decryptionKey", decryptionKey);
      formData.append("file", file);

      try {
        const response = await apiRequest.post("/api/v3/external-migration/env-key/", formData, {
          headers: {
            "Content-Type": "multipart/form-data"
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / (progressEvent?.total || 1)
            );
            console.log(`Upload Progress: ${percentCompleted}%`);
          }
        });

        console.log("Upload successful:", response.data);
      } catch (error) {
        console.error("Upload failed:", error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getAllUserWorkspace()
      });
    }
  });
};

export const useImportVault = () => {
  return useMutation({
    mutationFn: async ({
      vaultAccessToken,
      vaultNamespace,
      vaultUrl,
      mappingType
    }: {
      vaultAccessToken: string;
      vaultNamespace?: string;
      vaultUrl: string;
      mappingType: string;
    }) => {
      await apiRequest.post("/api/v3/external-migration/vault/", {
        vaultAccessToken,
        vaultNamespace,
        vaultUrl,
        mappingType
      });
    }
  });
};
