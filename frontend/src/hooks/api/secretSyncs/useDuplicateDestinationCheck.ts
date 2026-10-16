import { useMemo } from "react";

import { getSecretSyncDestinationConfig } from "@app/components/secret-syncs/forms/schemas/secret-sync-schema";
import { SecretSync, useCheckDuplicateDestination } from "@app/hooks/api/secretSyncs";

type UseDuplicateDestinationCheckProps = {
  destination: SecretSync;
  projectId: string;
  excludeSyncId?: string;
  connectionId?: string;
  enabled?: boolean;
  destinationConfig?: unknown;
};

export const useDuplicateDestinationCheck = ({
  destination,
  projectId,
  excludeSyncId,
  connectionId,
  enabled = true,
  destinationConfig
}: UseDuplicateDestinationCheckProps) => {
  const normalizedConfig = useMemo(
    () => getSecretSyncDestinationConfig(destination, destinationConfig),
    [destination, destinationConfig]
  );

  const hasValidConfig = Boolean(normalizedConfig && Object.keys(normalizedConfig).length > 0);

  const shouldCheck = enabled && hasValidConfig;

  const {
    data: duplicateData,
    isLoading,
    error,
    refetch
  } = useCheckDuplicateDestination(
    destination,
    normalizedConfig,
    projectId,
    excludeSyncId,
    connectionId,
    {
      enabled: shouldCheck,
      staleTime: 0,
      gcTime: 0
    }
  );

  return {
    hasDuplicate: shouldCheck ? Boolean(duplicateData?.hasDuplicate) : false,
    duplicateProjectId: duplicateData?.duplicateProjectId,
    isChecking: shouldCheck && isLoading,
    hasError: Boolean(error),
    hasValidConfig,
    refetch
  };
};
