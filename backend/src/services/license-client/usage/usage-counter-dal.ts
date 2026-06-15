import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { CertStatus } from "@app/services/certificate/certificate-types";

export type TUsageCounterDALFactory = ReturnType<typeof usageCounterDALFactory>;

const toCount = (row: unknown): number => Number((row as { count?: string | number } | undefined)?.count ?? 0);

// Live counts for the project-scoped metered features. Each sums across the org's projects,
// excluding soft-deleted projects so they don't inflate a quota. Org-scoped identities are
// counted via licenseDAL.countOrgUsersAndIdentities and wired in usage-counters.ts.
export const usageCounterDALFactory = (db: TDbClient) => {
  const countInternalCas = async (orgId: string): Promise<number> => {
    try {
      const row = await db
        .replicaNode()(TableName.CertificateAuthority)
        .join(
          TableName.InternalCertificateAuthority,
          `${TableName.CertificateAuthority}.id`,
          `${TableName.InternalCertificateAuthority}.caId`
        )
        .join(TableName.Project, `${TableName.CertificateAuthority}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .count(`${TableName.CertificateAuthority}.id as count`)
        .first();
      return toCount(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count internal CAs for usage" });
    }
  };

  const countActiveCerts = async (orgId: string): Promise<number> => {
    try {
      const row = await db
        .replicaNode()(TableName.Certificate)
        .join(TableName.Project, `${TableName.Certificate}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .where(`${TableName.Certificate}.status`, CertStatus.ACTIVE)
        .where(`${TableName.Certificate}.notAfter`, ">", new Date())
        .whereNull(`${TableName.Certificate}.revokedAt`)
        .whereNull(`${TableName.Certificate}.renewedByCertificateId`)
        .count(`${TableName.Certificate}.id as count`)
        .first();
      return toCount(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count active certificates for usage" });
    }
  };

  const countPamResources = async (orgId: string): Promise<number> => {
    try {
      const row = await db
        .replicaNode()(TableName.PamResource)
        .join(TableName.Project, `${TableName.PamResource}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .count(`${TableName.PamResource}.id as count`)
        .first();
      return toCount(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count PAM resources for usage" });
    }
  };

  return { countInternalCas, countActiveCerts, countPamResources };
};
