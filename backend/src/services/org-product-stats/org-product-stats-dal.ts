import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { ProjectType, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TOrgProductStatsDALFactory = ReturnType<typeof orgProductStatsDALFactory>;

export const orgProductStatsDALFactory = (db: TDbClient) => {
  const countSecretsForOrg = async (orgId: string, tx?: Knex) => {
    try {
      const result = (await (tx || db.replicaNode())(TableName.SecretV2)
        .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .where(`${TableName.Project}.type`, ProjectType.SecretManager)
        .count(`${TableName.SecretV2}.id as count`)
        .first()) as { count: string } | undefined;

      return parseInt(result?.count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountSecretsForOrg" });
    }
  };

  const countCertificatesForOrg = async (orgId: string, tx?: Knex) => {
    try {
      const result = (await (tx || db.replicaNode())(TableName.Certificate)
        .join(TableName.Project, `${TableName.Certificate}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .where(`${TableName.Project}.type`, ProjectType.CertificateManager)
        .count(`${TableName.Certificate}.id as count`)
        .first()) as { count: string } | undefined;

      return parseInt(result?.count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountCertificatesForOrg" });
    }
  };

  const countCertificateAuthoritiesForOrg = async (orgId: string, tx?: Knex) => {
    try {
      const result = (await (tx || db.replicaNode())(TableName.CertificateAuthority)
        .join(TableName.Project, `${TableName.CertificateAuthority}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .where(`${TableName.Project}.type`, ProjectType.CertificateManager)
        .count(`${TableName.CertificateAuthority}.id as count`)
        .first()) as { count: string } | undefined;

      return parseInt(result?.count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountCertificateAuthoritiesForOrg" });
    }
  };

  const countKmsKeysForOrg = async (orgId: string, tx?: Knex) => {
    try {
      const result = (await (tx || db.replicaNode())(TableName.KmsKey)
        .join(TableName.Project, `${TableName.KmsKey}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .where(`${TableName.Project}.type`, ProjectType.KMS)
        .count(`${TableName.KmsKey}.id as count`)
        .first()) as { count: string } | undefined;

      return parseInt(result?.count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountKmsKeysForOrg" });
    }
  };

  const countDataSourcesForOrg = async (orgId: string, tx?: Knex) => {
    try {
      const result = (await (tx || db.replicaNode())(TableName.SecretScanningDataSource)
        .join(TableName.Project, `${TableName.SecretScanningDataSource}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .where(`${TableName.Project}.type`, ProjectType.SecretScanning)
        .count(`${TableName.SecretScanningDataSource}.id as count`)
        .first()) as { count: string } | undefined;

      return parseInt(result?.count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountDataSourcesForOrg" });
    }
  };

  const countPamAccountsForOrg = async (orgId: string, tx?: Knex) => {
    try {
      const result = (await (tx || db.replicaNode())(TableName.PamAccount)
        .join(TableName.Project, `${TableName.PamAccount}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .where(`${TableName.Project}.type`, ProjectType.PAM)
        .count(`${TableName.PamAccount}.id as count`)
        .first()) as { count: string } | undefined;

      return parseInt(result?.count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountPamAccountsForOrg" });
    }
  };

  const countEnvironmentsForOrg = async (orgId: string, tx?: Knex) => {
    try {
      const result = (await (tx || db.replicaNode())(TableName.Environment)
        .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .where(`${TableName.Project}.type`, ProjectType.SecretManager)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .count(`${TableName.Environment}.id as count`)
        .first()) as { count: string } | undefined;

      return parseInt(result?.count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountEnvironmentsForOrg" });
    }
  };

  const countSignersForOrg = async (orgId: string, tx?: Knex) => {
    try {
      const result = (await (tx || db.replicaNode())(TableName.PkiSigners)
        .join(TableName.Project, `${TableName.PkiSigners}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .where(`${TableName.Project}.type`, ProjectType.CertificateManager)
        .count(`${TableName.PkiSigners}.id as count`)
        .first()) as { count: string } | undefined;

      return parseInt(result?.count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountSignersForOrg" });
    }
  };

  const countKmipClientsForOrg = async (orgId: string, tx?: Knex) => {
    try {
      const result = (await (tx || db.replicaNode())(TableName.KmipClient)
        .join(TableName.Project, `${TableName.KmipClient}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .where(`${TableName.Project}.type`, ProjectType.KMS)
        .count(`${TableName.KmipClient}.id as count`)
        .first()) as { count: string } | undefined;

      return parseInt(result?.count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountKmipClientsForOrg" });
    }
  };

  const countSecretScanningResourcesForOrg = async (orgId: string, tx?: Knex) => {
    try {
      const result = (await (tx || db.replicaNode())(TableName.SecretScanningResource)
        .join(
          TableName.SecretScanningDataSource,
          `${TableName.SecretScanningResource}.dataSourceId`,
          `${TableName.SecretScanningDataSource}.id`
        )
        .join(TableName.Project, `${TableName.SecretScanningDataSource}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .where(`${TableName.Project}.type`, ProjectType.SecretScanning)
        .count(`${TableName.SecretScanningResource}.id as count`)
        .first()) as { count: string } | undefined;

      return parseInt(result?.count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountSecretScanningResourcesForOrg" });
    }
  };

  const countPamResourcesForOrg = async (orgId: string, tx?: Knex) => {
    try {
      const result = (await (tx || db.replicaNode())(TableName.PamResource)
        .join(TableName.Project, `${TableName.PamResource}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .where(`${TableName.Project}.type`, ProjectType.PAM)
        .count(`${TableName.PamResource}.id as count`)
        .first()) as { count: string } | undefined;

      return parseInt(result?.count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountPamResourcesForOrg" });
    }
  };

  const countProjectsByTypeForOrg = async (orgId: string, tx?: Knex) => {
    try {
      const results = (await (tx || db.replicaNode())(TableName.Project)
        .where("orgId", orgId)
        .whereNull("deleteAfter")
        .groupBy("type")
        .select("type")
        .count("id as count")) as Array<{ type: string; count: string }>;

      return results.reduce(
        (acc, row) => {
          acc[row.type as ProjectType] = parseInt(row.count, 10);
          return acc;
        },
        {} as Record<ProjectType, number>
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "CountProjectsByTypeForOrg" });
    }
  };

  return {
    countSecretsForOrg,
    countEnvironmentsForOrg,
    countCertificatesForOrg,
    countCertificateAuthoritiesForOrg,
    countSignersForOrg,
    countKmsKeysForOrg,
    countKmipClientsForOrg,
    countDataSourcesForOrg,
    countSecretScanningResourcesForOrg,
    countPamAccountsForOrg,
    countPamResourcesForOrg,
    countProjectsByTypeForOrg
  };
};
