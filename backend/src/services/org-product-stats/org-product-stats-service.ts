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
      certificatesCount,
      certificateAuthoritiesCount,
      keysCount,
      dataSourcesCount,
      accountsCount,
      projectCounts
    ] = await Promise.all([
      orgProductStatsDAL.countSecretsForOrg(actorOrgId),
      orgProductStatsDAL.countCertificatesForOrg(actorOrgId),
      orgProductStatsDAL.countCertificateAuthoritiesForOrg(actorOrgId),
      orgProductStatsDAL.countKmsKeysForOrg(actorOrgId),
      orgProductStatsDAL.countDataSourcesForOrg(actorOrgId),
      orgProductStatsDAL.countPamAccountsForOrg(actorOrgId),
      orgProductStatsDAL.countProjectsByTypeForOrg(actorOrgId)
    ]);

    return {
      secretManager: {
        secretsCount,
        projectsCount: projectCounts[ProjectType.SecretManager] || 0
      },
      certificateManager: {
        certificatesCount,
        certificateAuthoritiesCount
      },
      kms: {
        keysCount,
        projectsCount: projectCounts[ProjectType.KMS] || 0
      },
      secretScanning: {
        dataSourcesCount,
        projectsCount: projectCounts[ProjectType.SecretScanning] || 0
      },
      pam: {
        accountsCount,
        projectsCount: projectCounts[ProjectType.PAM] || 0
      }
    };
  };

  return {
    getOrgProductStats
  };
};
