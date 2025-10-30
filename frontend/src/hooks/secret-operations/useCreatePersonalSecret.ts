import { useCallback } from "react";

import { useFetchSecretValue } from "../api/dashboard/queries";
import { SecretType } from "../api/types";
import { useHandleSecretOperation } from "./useHandleSecretOperation";

interface CreatePersonalSecretParams {
  key: string;
  secretPath: string;
  environment: string;
}

export function useCreatePersonalSecretOverride(projectId: string) {
  const handleSecretOperation = useHandleSecretOperation(projectId);
  const fetchSecretValue = useFetchSecretValue();

  const createPersonalSecretOverride = useCallback(
    async ({ key, secretPath, environment }: CreatePersonalSecretParams, value?: string) => {
      if (!value) {
        // Default to using current value of the secret
        const result = await fetchSecretValue({
          environment,
          projectId,
          secretKey: key,
          secretPath
        });
        value = result.value;
      }
      return handleSecretOperation(
        {
          operation: "create",
          type: SecretType.Personal,
          key,
          secretPath,
          environment
        },
        {
          value
        }
      );
    },
    [fetchSecretValue]
  );
  return createPersonalSecretOverride;
}
