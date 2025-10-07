import { useMemo } from "react";

import { SecretSync, useCheckDuplicateDestination } from "@app/hooks/api/secretSyncs";

type UseDuplicateDestinationCheckProps = {
  destination: SecretSync;
  projectId: string;
  excludeSyncId?: string;
  enabled?: boolean;
  destinationConfig?: unknown;
};

export const useDuplicateDestinationCheck = ({
  destination,
  projectId,
  excludeSyncId,
  enabled = true,
  destinationConfig
}: UseDuplicateDestinationCheckProps) => {
  const hasValidConfig = useMemo(() => {
    if (!destinationConfig || typeof destinationConfig !== "object") return false;

    const values = Object.values(destinationConfig);
    return (
      values.length > 0 &&
      values.some((value) => value !== null && value !== undefined && value !== "")
    );
  }, [destinationConfig]);

  const shouldCheck = enabled && hasValidConfig;

  const {
    data: duplicateData,
    isLoading,
    error,
    refetch
  } = useCheckDuplicateDestination(destination, destinationConfig, projectId, excludeSyncId, {
    enabled: shouldCheck,
    staleTime: 0,
    gcTime: 0
  });

  return {
    hasDuplicate: shouldCheck ? Boolean(duplicateData?.hasDuplicate) : false,
    duplicateProjectId: duplicateData?.duplicateProjectId,
    isChecking: shouldCheck && isLoading,
    hasError: Boolean(error),
    hasValidConfig,
    refetch
  };
};
