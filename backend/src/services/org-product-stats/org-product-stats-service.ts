import { ProjectType } from "@app/db/schemas";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { withCache } from "@app/lib/cache/with-cache";

import { TOrgProductStatsDALFactory } from "./org-product-stats-dal";
import { TOrgProductStats, TOrgProductStatsDTO } from "./org-product-stats-types";

type TOrgProductStatsServiceFactoryDep = {
  orgProductStatsDAL: TOrgProductStatsDALFactory;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
};

export type TOrgProductStatsServiceFactory = ReturnType<typeof orgProductStatsServiceFactory>;

export const orgProductStatsServiceFactory = ({ orgProductStatsDAL, keyStore }: TOrgProductStatsServiceFactoryDep) => {
  const getOrgProductStats = async ({ actorOrgId }: TOrgProductStatsDTO): Promise<TOrgProductStats> => {
    const [
      secretsCount,
      environmentsCount,
      certificatesCount,
      certificateAuthoritiesCount,
      signersCount,
      keysCount,
      clientsCount,
      dataSourcesCount,
      secretScanningResourcesCount,
      secretScanningFindingsCount,
      accountsCount,
      accountTemplatesCount,
      foldersCount,
      accessBundlesCount,
      servicesCount,
      proxiesCount,
      projectCounts
    ] = await Promise.all([
      orgProductStatsDAL.countSecretsForOrg(actorOrgId),
      orgProductStatsDAL.countEnvironmentsForOrg(actorOrgId),
      orgProductStatsDAL.countCertificatesForOrg(actorOrgId),
      orgProductStatsDAL.countCertificateAuthoritiesForOrg(actorOrgId),
      orgProductStatsDAL.countSignersForOrg(actorOrgId),
      orgProductStatsDAL.countKmsKeysForOrg(actorOrgId),
      orgProductStatsDAL.countKmipClientsForOrg(actorOrgId),
      orgProductStatsDAL.countDataSourcesForOrg(actorOrgId),
      orgProductStatsDAL.countSecretScanningResourcesForOrg(actorOrgId),
      // Findings grow with every scan, so this is the one count here worth not running on each dashboard load.
      withCache({
        keyStore,
        key: KeyStorePrefixes.OrgSecretScanningFindingsCount(actorOrgId),
        ttlSeconds: KeyStoreTtls.OrgSecretScanningFindingsCountInSeconds,
        fetcher: () => orgProductStatsDAL.countSecretScanningFindingsForOrg(actorOrgId)
      }),
      orgProductStatsDAL.countPamAccountsForOrg(actorOrgId),
      orgProductStatsDAL.countPamAccountTemplatesForOrg(actorOrgId),
      orgProductStatsDAL.countPamFoldersForOrg(actorOrgId),
      orgProductStatsDAL.countAgentVaultAccessBundlesForOrg(actorOrgId),
      orgProductStatsDAL.countAgentVaultServicesForOrg(actorOrgId),
      orgProductStatsDAL.countAgentVaultProxiesForOrg(actorOrgId),
      orgProductStatsDAL.countProjectsByTypeForOrg(actorOrgId)
    ]);

    return {
      secretManager: {
        secretsCount,
        environmentsCount,
        projectsCount: projectCounts[ProjectType.SecretManager] || 0
      },
      certificateManager: {
        certificatesCount,
        certificateAuthoritiesCount,
        signersCount
      },
      kms: {
        keysCount,
        clientsCount,
        projectsCount: projectCounts[ProjectType.KMS] || 0
      },
      secretScanning: {
        dataSourcesCount,
        resourcesCount: secretScanningResourcesCount,
        findingsCount: secretScanningFindingsCount,
        projectsCount: projectCounts[ProjectType.SecretScanning] || 0
      },
      pam: {
        accountsCount,
        accountTemplatesCount,
        foldersCount
      },
      agentVault: {
        accessBundlesCount,
        servicesCount,
        proxiesCount
      }
    };
  };

  return {
    getOrgProductStats
  };
};
