import { ProjectType } from "@app/db/schemas";

import { TOrgProductStatsDALFactory } from "./org-product-stats-dal";
import { TOrgProductStats, TOrgProductStatsDTO } from "./org-product-stats-types";

type TOrgProductStatsServiceFactoryDep = {
  orgProductStatsDAL: TOrgProductStatsDALFactory;
};

export type TOrgProductStatsServiceFactory = ReturnType<typeof orgProductStatsServiceFactory>;

export const orgProductStatsServiceFactory = ({ orgProductStatsDAL }: TOrgProductStatsServiceFactoryDep) => {
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
      accountsCount,
      accountTemplatesCount,
      foldersCount,
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
      orgProductStatsDAL.countPamAccountsForOrg(actorOrgId),
      orgProductStatsDAL.countPamAccountTemplatesForOrg(actorOrgId),
      orgProductStatsDAL.countPamFoldersForOrg(actorOrgId),
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
        projectsCount: projectCounts[ProjectType.SecretScanning] || 0
      },
      pam: {
        accountsCount,
        accountTemplatesCount,
        foldersCount
      }
    };
  };

  return {
    getOrgProductStats
  };
};
