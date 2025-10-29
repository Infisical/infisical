import { useCallback } from "react";

import { SecretType } from "../api/types";
import { useHandleSecretOperation } from "./useHandleSecretOperation";

interface CreatePersonalSecretParams {
  key: string;
  secretPath: string;
  environment: string;
}

export function useCreatePersonalSecretOverride(projectId: string) {
  const handleSecretOperation = useHandleSecretOperation(projectId);

  const createPersonalSecretOverride = useCallback(
    ({ key, secretPath, environment }: CreatePersonalSecretParams, value?: string) => {
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
    []
  );
  return createPersonalSecretOverride;
}
