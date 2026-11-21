import type {
  AzureDevOpsProject,
  TAzureScimServicePrincipal
} from "@app/hooks/api/appConnections/azure/types";
import type {
  TCloudflarePagesProject,
  TCloudflareSecretsStore,
  TCloudflareWorkersScript
} from "@app/hooks/api/appConnections/cloudflare/types";
import type { TDigitalOceanApp } from "@app/hooks/api/appConnections/digital-ocean/types";
import type {
  TListOCIVaultKeys,
  TListOCIVaults,
  TOCICompartment,
  TOCIVault,
  TOCIVaultKey
} from "@app/hooks/api/appConnections/oci/types";

import type { V4QueryResult } from "../contract";
import type { ConnectionOptions, QueryOptions } from "./contract-options";

export type SyncCloudLookups = {
  useAzureDevOpsProjects: ConnectionOptions<AzureDevOpsProject>;
  useAzureScimServicePrincipals: (
    dto: { connectionId: string; search?: string },
    options?: QueryOptions
  ) => V4QueryResult<TAzureScimServicePrincipal[]>;
  useOciCompartments: ConnectionOptions<TOCICompartment>;
  useOciVaults: (dto: TListOCIVaults, options?: QueryOptions) => V4QueryResult<TOCIVault[]>;
  useOciVaultKeys: (
    dto: TListOCIVaultKeys,
    options?: QueryOptions
  ) => V4QueryResult<TOCIVaultKey[]>;
  useDigitalOceanApps: ConnectionOptions<TDigitalOceanApp>;
  useCloudflarePagesProjects: ConnectionOptions<TCloudflarePagesProject>;
  useCloudflareWorkersScripts: ConnectionOptions<TCloudflareWorkersScript>;
  useCloudflareSecretsStores: ConnectionOptions<TCloudflareSecretsStore>;
};
