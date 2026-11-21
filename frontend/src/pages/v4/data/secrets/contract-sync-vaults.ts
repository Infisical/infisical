import type { TOnePassVault } from "@app/hooks/api/appConnections/1password";
import type { TChefDataBag, TChefDataBagItem } from "@app/hooks/api/appConnections/chef";
import type {
  TRemoteInfisicalEnvironmentFolderTree,
  TRemoteInfisicalProject
} from "@app/hooks/api/appConnections/external-infisical";
import type { TKeeperSharedFolder } from "@app/hooks/api/appConnections/keeper";

import type { V4QueryResult } from "../contract";
import type { ConnectionOptions, QueryOptions } from "./contract-options";

export type SyncVaultsLookups = {
  useOnePassVaults: ConnectionOptions<TOnePassVault>;
  useHCVaultMounts: ConnectionOptions<string>;
  useKeeperSharedFolders: ConnectionOptions<TKeeperSharedFolder>;
  useExternalInfisicalProjects: ConnectionOptions<TRemoteInfisicalProject>;
  useExternalInfisicalFolderTree: (
    dto: { connectionId: string; projectId: string },
    options?: QueryOptions
  ) => V4QueryResult<TRemoteInfisicalEnvironmentFolderTree>;
  useChefDataBags: ConnectionOptions<TChefDataBag>;
  useChefDataBagItems: (
    dto: { connectionId: string; dataBagName: string },
    options?: QueryOptions
  ) => V4QueryResult<TChefDataBagItem[]>;
};
