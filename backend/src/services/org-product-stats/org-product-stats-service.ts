import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope, ProjectType } from "@app/db/schemas";
import { TKmsKeyService } from "@app/domains/platform/kms-core/ce/module";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { hasAnyGrant } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { withCache } from "@app/lib/cache/with-cache";

import { TOrgProductStatsDALFactory } from "./org-product-stats-dal";
import { TOrgProductStats, TOrgProductStatsDTO } from "./org-product-stats-types";

type TOrgProductStatsServiceFactoryDep = {
  orgProductStatsDAL: TOrgProductStatsDALFactory;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
  kmsKeyService: TKmsKeyService;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export type TOrgProductStatsServiceFactory = ReturnType<typeof orgProductStatsServiceFactory>;

export const orgProductStatsServiceFactory = ({
  orgProductStatsDAL,
  keyStore,
  kmsKeyService,
  permissionService
}: TOrgProductStatsServiceFactoryDep) => {
  const getOrgProductStats = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TOrgProductStatsDTO): Promise<TOrgProductStats> => {
    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });
    if (!hasAnyGrant(permission)) {
      // Thrown through CASL so the denial is audited.
      ForbiddenError.from(permission)
        .setMessage("Your organization role does not grant access to product statistics")
        .throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);
    }

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
      servicesCount,
      skillsCount,
      projectCounts
    ] = await Promise.all([
      orgProductStatsDAL.countSecretsForOrg(actorOrgId),
      orgProductStatsDAL.countEnvironmentsForOrg(actorOrgId),
      orgProductStatsDAL.countCertificatesForOrg(actorOrgId),
      orgProductStatsDAL.countCertificateAuthoritiesForOrg(actorOrgId),
      orgProductStatsDAL.countSignersForOrg(actorOrgId),
      kmsKeyService.countProjectKeysInOrg(actorOrgId, ProjectType.KMS),
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
      orgProductStatsDAL.countAgentVaultServicesForOrg(actorOrgId),
      orgProductStatsDAL.countAgentVaultSkillsForOrg(actorOrgId),
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
        servicesCount,
        skillsCount,
        projectsCount: projectCounts[ProjectType.AgentVault] || 0
      }
    };
  };

  return {
    getOrgProductStats
  };
};
