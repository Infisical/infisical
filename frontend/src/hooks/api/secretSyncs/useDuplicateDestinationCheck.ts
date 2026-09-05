import { useMemo } from "react";

import { SecretSync, useCheckDuplicateDestination } from "@app/hooks/api/secretSyncs";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const omitEmptyValues = (config: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(config).flatMap(([key, value]) => {
      if (value === null || value === undefined || value === "") return [];
      return [[key, isPlainObject(value) ? omitEmptyValues(value) : value]];
    })
  );

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
    () => (isPlainObject(destinationConfig) ? omitEmptyValues(destinationConfig) : undefined),
    [destinationConfig]
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
