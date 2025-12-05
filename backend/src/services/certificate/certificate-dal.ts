import RE2 from "re2";

import { TDbClient } from "@app/db";
import { TableName, TCertificates } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import {
  applyProcessedPermissionRulesToQuery,
  type ProcessedPermissionRules
} from "@app/lib/knex/permission-filter-utils";

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
        const sanitizedValue = String(friendlyName).replace(new RE2("[%_\\\\]", "g"), "\\$&");
        query = query.andWhere(`${TableName.Certificate}.friendlyName`, "like", `%${sanitizedValue}%`);
      }

      if (commonName) {
        const sanitizedValue = String(commonName).replace(new RE2("[%_\\\\]", "g"), "\\$&");
        query = query.andWhere(`${TableName.Certificate}.commonName`, "like", `%${sanitizedValue}%`);
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

  const findActiveCertificatesByIds = async (certificateIds: string[]): Promise<TCertificates[]> => {
    try {
      if (certificateIds.length === 0) {
        return [];
      }

      const certs = await db
        .replicaNode()(TableName.Certificate)
        .whereIn("id", certificateIds)
        .where({ status: CertStatus.ACTIVE })
        .where("notAfter", ">", new Date())
        .orderBy("notBefore", "desc")
        .select("*");

      return certs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find active certificates by IDs" });
    }
  };

  const findActiveCertificatesForSync = async (
    filter: Partial<TCertificates & { friendlyName?: string; commonName?: string }>,
    options?: { limit?: number; offset?: number },
    permissionFilters?: ProcessedPermissionRules
  ): Promise<(TCertificates & { hasPrivateKey: boolean })[]> => {
    try {
      let query = db
        .replicaNode()(TableName.Certificate)
        .leftJoin(TableName.CertificateSecret, `${TableName.Certificate}.id`, `${TableName.CertificateSecret}.certId`)
        .select(selectAllTableCols(TableName.Certificate))
        .select(db.ref(`${TableName.CertificateSecret}.certId`).as("privateKeyRef"))
        .where({ status: CertStatus.ACTIVE })
        .where("notAfter", ">", new Date())
        .whereNull("renewedByCertificateId");

      Object.entries(filter).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (key === "friendlyName" || key === "commonName") {
            const sanitizedValue = String(value).replace(new RE2("[%_\\\\]", "g"), "\\$&");
            query = query.andWhere(`${TableName.Certificate}.${key}`, "like", `%${sanitizedValue}%`);
          } else {
            query = query.andWhere(`${TableName.Certificate}.${key}`, value);
          }
        }
      });

      if (permissionFilters) {
        query = applyProcessedPermissionRulesToQuery(query, TableName.Certificate, permissionFilters) as typeof query;
      }

      if (options?.offset) {
        query = query.offset(options.offset);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      query = query.orderBy("createdAt", "desc");

      const certs = await query;
      return certs.map((cert) => ({ ...cert, hasPrivateKey: Boolean(cert.privateKeyRef) }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find active certificates for sync" });
    }
  };

  const countActiveCertificatesForSync = async ({
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
        .where(`${TableName.Project}.id`, projectId)
        .where(`${TableName.Certificate}.status`, CertStatus.ACTIVE)
        .where(`${TableName.Certificate}.notAfter`, ">", new Date())
        .whereNull(`${TableName.Certificate}.renewedByCertificateId`);

      if (friendlyName) {
        const sanitizedValue = String(friendlyName).replace(new RE2("[%_\\\\]", "g"), "\\$&");
        query = query.andWhere(`${TableName.Certificate}.friendlyName`, "like", `%${sanitizedValue}%`);
      }

      if (commonName) {
        const sanitizedValue = String(commonName).replace(new RE2("[%_\\\\]", "g"), "\\$&");
        query = query.andWhere(`${TableName.Certificate}.commonName`, "like", `%${sanitizedValue}%`);
      }

      const count = await query.count("*").first();

      return parseInt((count as unknown as CountResult).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count active certificates for sync" });
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
        .innerJoin(TableName.CertificateSecret, `${TableName.Certificate}.id`, `${TableName.CertificateSecret}.certId`)
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

  const findWithPrivateKeyInfo = async (
    filter: Partial<TCertificates & { friendlyName?: string; commonName?: string }>,
    options?: { offset?: number; limit?: number; sort?: [string, "asc" | "desc"][] },
    permissionFilters?: ProcessedPermissionRules
  ): Promise<(TCertificates & { hasPrivateKey: boolean })[]> => {
    try {
      let query = db
        .replicaNode()(TableName.Certificate)
        .leftJoin(TableName.CertificateSecret, `${TableName.Certificate}.id`, `${TableName.CertificateSecret}.certId`)
        .select(selectAllTableCols(TableName.Certificate))
        .select(db.ref(`${TableName.CertificateSecret}.certId`).as("privateKeyRef"));

      Object.entries(filter).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (key === "friendlyName" || key === "commonName") {
            const sanitizedValue = String(value).replace(new RE2("[%_\\\\]", "g"), "\\$&");
            query = query.andWhere(`${TableName.Certificate}.${key}`, "like", `%${sanitizedValue}%`);
          } else {
            query = query.andWhere(`${TableName.Certificate}.${key}`, value);
          }
        }
      });

      if (permissionFilters) {
        query = applyProcessedPermissionRulesToQuery(query, TableName.Certificate, permissionFilters) as typeof query;
      }

      if (options?.offset) {
        query = query.offset(options.offset);
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.sort) {
        options.sort.forEach(([column, direction]) => {
          query = query.orderBy(column, direction);
        });
      }

      const results = await query;
      return results.map((row) => {
        return {
          ...row,
          hasPrivateKey: row.privateKeyRef !== null
        };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificates with private key info" });
    }
  };

  return {
    ...certificateOrm,
    countCertificatesInProject,
    countActiveCertificatesForSync,
    countCertificatesForPkiSubscriber,
    findLatestActiveCertForSubscriber,
    findAllActiveCertsForSubscriber,
    findExpiredSyncedCertificates,
    findActiveCertificatesByIds,
    findActiveCertificatesForSync,
    findCertificatesEligibleForRenewal,
    findWithPrivateKeyInfo
  };
};
