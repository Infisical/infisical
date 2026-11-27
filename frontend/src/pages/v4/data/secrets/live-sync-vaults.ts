import { useOnePassConnectionListVaults } from "@app/hooks/api/appConnections/1password";
import {
  useChefConnectionListDataBagItems,
  useChefConnectionListDataBags
} from "@app/hooks/api/appConnections/chef";
import {
  useExternalInfisicalConnectionGetEnvironmentFolderTree,
  useExternalInfisicalConnectionListProjects
} from "@app/hooks/api/appConnections/external-infisical";
import { useHCVaultConnectionListMounts } from "@app/hooks/api/appConnections/hc-vault";
import { useKeeperConnectionListSharedFolders } from "@app/hooks/api/appConnections/keeper";

import type { SyncVaultsLookups } from "./contract-sync-vaults";

export const syncVaultsLive: SyncVaultsLookups = {
  useOnePassVaults: (connectionId, options) =>
    useOnePassConnectionListVaults(connectionId, options),
  useHCVaultMounts: (connectionId, options) =>
    useHCVaultConnectionListMounts(connectionId, options),
  useKeeperSharedFolders: (connectionId, options) =>
    useKeeperConnectionListSharedFolders(connectionId, options),
  useExternalInfisicalProjects: (connectionId, options) =>
    useExternalInfisicalConnectionListProjects(connectionId, options),
  useExternalInfisicalFolderTree: ({ connectionId, projectId }, options) =>
    useExternalInfisicalConnectionGetEnvironmentFolderTree(connectionId, projectId, options),
  useChefDataBags: (connectionId, options) => useChefConnectionListDataBags(connectionId, options),
  useChefDataBagItems: ({ connectionId, dataBagName }, options) =>
    useChefConnectionListDataBagItems(connectionId, dataBagName, options)
};
