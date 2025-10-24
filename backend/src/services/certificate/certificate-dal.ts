import { TDbClient } from "@app/db";
import { TableName, TCertificates } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { CertStatus } from "./certificate-types";

export type TCertificateDALFactory = ReturnType<typeof certificateDALFactory>;

export const certificateDALFactory = (db: TDbClient) => {
  const certificateOrm = ormify(db, TableName.Certificate);

  const findLatestActiveCertForSubscriber = async ({ subscriberId }: { subscriberId: string }) => {
    try {
      const cert = await db
        .replicaNode()(TableName.Certificate)
        .where({ pkiSubscriberId: subscriberId, status: CertStatus.ACTIVE })
        .where("notAfter", ">", new Date())
        .orderBy("notBefore", "desc")
        .first();

      return cert;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find latest active certificate for subscriber" });
    }
  };

  const findAllActiveCertsForSubscriber = async ({ subscriberId }: { subscriberId: string }) => {
    try {
      const certs = await db
        .replicaNode()(TableName.Certificate)
        .where({ pkiSubscriberId: subscriberId, status: CertStatus.ACTIVE })
        .where("notAfter", ">", new Date())
        .orderBy("notBefore", "desc");

      return certs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all active certificates for subscriber" });
    }
  };

  const countCertificatesInProject = async ({
    projectId,
    friendlyName,
    commonName
  }: {
    projectId: string;
    friendlyName?: string;
    commonName?: string;
  }) => {
    try {
      interface CountResult {
        count: string;
      }

      let query = db
        .replicaNode()(TableName.Certificate)
        .join(TableName.CertificateAuthority, `${TableName.Certificate}.caId`, `${TableName.CertificateAuthority}.id`)
        .join(TableName.Project, `${TableName.CertificateAuthority}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.id`, projectId);

      if (friendlyName) {
        query = query.andWhere(`${TableName.Certificate}.friendlyName`, friendlyName);
      }

      if (commonName) {
        query = query.andWhere(`${TableName.Certificate}.commonName`, commonName);
      }

      const count = await query.count("*").first();

      return parseInt((count as unknown as CountResult).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count all project certificates" });
    }
  };

  const countCertificatesForPkiSubscriber = async (subscriberId: string) => {
    try {
      interface CountResult {
        count: string;
      }

      const query = db
        .replicaNode()(TableName.Certificate)
        .where(`${TableName.Certificate}.pkiSubscriberId`, subscriberId);

      const count = await query.count("*").first();

      return parseInt((count as unknown as CountResult).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count all subscriber certificates" });
    }
  };

  const findExpiredSyncedCertificates = async (): Promise<TCertificates[]> => {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const certs = await db
        .replicaNode()(TableName.Certificate)
        .where("notAfter", ">=", yesterday)
        .where("notAfter", "<", today)
        .whereNotNull("pkiSubscriberId");

      return certs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find expired synced certificates" });
    }
  };

  const findCertificatesEligibleForRenewal = async ({
    limit,
    offset
  }: {
    limit: number;
    offset: number;
  }): Promise<(TCertificates & { profileName?: string })[]> => {
    try {
      const now = new Date();
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      const certs = (await db
        .replicaNode()(TableName.Certificate)
        .select(selectAllTableCols(TableName.Certificate))
        .select(db.ref("slug").withSchema(TableName.PkiCertificateProfile).as("profileName"))
        .leftJoin(
          TableName.PkiCertificateProfile,
          `${TableName.Certificate}.profileId`,
          `${TableName.PkiCertificateProfile}.id`
        )
        .where(`${TableName.Certificate}.status`, CertStatus.ACTIVE)
        .whereNull(`${TableName.Certificate}.renewedByCertificateId`)
        .whereNull(`${TableName.Certificate}.renewalError`)
        .whereNull(`${TableName.Certificate}.revokedAt`)
        .whereNotNull(`${TableName.Certificate}.profileId`)
        .whereNotNull(`${TableName.Certificate}.notAfter`)
        .where(`${TableName.Certificate}.notAfter`, ">", now)
        .whereNotNull(`${TableName.Certificate}.renewBeforeDays`)
        .where(`${TableName.Certificate}.renewBeforeDays`, ">", 0)
        .whereRaw(
          `"${TableName.Certificate}"."notAfter" - INTERVAL '1 day' * "${TableName.Certificate}"."renewBeforeDays" <= ?`,
          [endOfDay]
        )
        .limit(limit)
        .offset(offset)
        .orderBy(`${TableName.Certificate}.notAfter`, "asc")) as TCertificates[];

      return certs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificates eligible for renewal" });
    }
  };

  return {
    ...certificateOrm,
    countCertificatesInProject,
    countCertificatesForPkiSubscriber,
    findLatestActiveCertForSubscriber,
    findAllActiveCertsForSubscriber,
    findExpiredSyncedCertificates,
    findCertificatesEligibleForRenewal
  };
};
