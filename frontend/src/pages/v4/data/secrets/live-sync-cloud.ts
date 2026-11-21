import {
  useAzureEntraIdConnectionListScimServicePrincipals,
  useGetAzureDevOpsProjects
} from "@app/hooks/api/appConnections/azure";
import {
  useCloudflareConnectionListPagesProjects,
  useCloudflareConnectionListSecretsStores,
  useCloudflareConnectionListWorkersScripts
} from "@app/hooks/api/appConnections/cloudflare";
import { useDigitalOceanConnectionListApps } from "@app/hooks/api/appConnections/digital-ocean";
import {
  useOCIConnectionListCompartments,
  useOCIConnectionListVaultKeys,
  useOCIConnectionListVaults
} from "@app/hooks/api/appConnections/oci/queries";

import type { SyncCloudLookups } from "./contract-sync-cloud";

export const syncCloudLive: SyncCloudLookups = {
  useAzureDevOpsProjects: (connectionId, options) => {
    const query = useGetAzureDevOpsProjects(connectionId, options);
    return { data: query.data?.projects, isPending: query.isPending, error: query.error };
  },
  useAzureScimServicePrincipals: ({ connectionId, search }, options) =>
    useAzureEntraIdConnectionListScimServicePrincipals(connectionId, search, options),
  useOciCompartments: (connectionId, options) =>
    useOCIConnectionListCompartments(connectionId, options),
  useOciVaults: (dto, options) => useOCIConnectionListVaults(dto, options),
  useOciVaultKeys: (dto, options) => useOCIConnectionListVaultKeys(dto, options),
  useDigitalOceanApps: (connectionId, options) =>
    useDigitalOceanConnectionListApps(connectionId, options),
  useCloudflarePagesProjects: (connectionId, options) =>
    useCloudflareConnectionListPagesProjects(connectionId, options),
  useCloudflareWorkersScripts: (connectionId, options) =>
    useCloudflareConnectionListWorkersScripts(connectionId, options),
  useCloudflareSecretsStores: (connectionId, options) =>
    useCloudflareConnectionListSecretsStores(connectionId, options)
};
