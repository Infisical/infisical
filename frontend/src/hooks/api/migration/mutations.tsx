import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace";

export const useImportEnvKey = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      encryptedJson,
      decryptionKey
    }: {
      encryptedJson: {
        nonce: string;
        data: string;
      };
      decryptionKey: string;
    }) => {
      const { data } = await apiRequest.post("/api/v3/migrate/env-key/", {
        encryptedJson,
        decryptionKey
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};
