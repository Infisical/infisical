import { apiRequest } from "@app/config/request";
import { useQuery } from "@tanstack/react-query";
import { ExternalMigrationProviders } from "./types";

const externalMigrationQueryKeys = {
  customMigrationAvailable: (provider: ExternalMigrationProviders) => [
    "custom-migration-available",
    provider
  ]
};

export const useHasCustomMigrationAvailable = (provider: ExternalMigrationProviders) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.customMigrationAvailable(provider),
    queryFn: () =>
      apiRequest.get<{ enabled: boolean }>(
        `/api/v3/external-migration/custom-migration-enabled/${provider}`
      )
  });
};
