import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TCertificates } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn/string";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import {
  applyProcessedPermissionRulesToQuery,
  type ProcessedPermissionRules
} from "@app/lib/knex/permission-filter-utils";
import { isUuidV4 } from "@app/lib/validator";
import { applyMetadataFilter } from "@app/services/resource-metadata/resource-metadata-fns";

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
    commonName,
    search,
    status,
    profileIds,
    fromDate,
    toDate,
    metadataFilter
  }: {
    projectId: string;
    friendlyName?: string;
    commonName?: string;
    search?: string;
    status?: string | string[];
    profileIds?: string[];
    fromDate?: Date;
    toDate?: Date;
    metadataFilter?: Array<{ key: string; value?: string }>;
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
        const sanitizedValue = sanitizeSqlLikeString(friendlyName);
        query = query.andWhere(`${TableName.Certificate}.friendlyName`, "like", `%${sanitizedValue}%`);
      }

      if (commonName) {
        const sanitizedValue = sanitizeSqlLikeString(commonName);
        query = query.andWhere(`${TableName.Certificate}.commonName`, "like", `%${sanitizedValue}%`);
      }

      if (search) {
        const sanitizedValue = sanitizeSqlLikeString(search);
        query = query.andWhere((qb) => {
          void qb
            .where(`${TableName.Certificate}.commonName`, "like", `%${sanitizedValue}%`)
            .orWhere(`${TableName.Certificate}.altNames`, "like", `%${sanitizedValue}%`)
            .orWhere(`${TableName.Certificate}.serialNumber`, "like", `%${sanitizedValue}%`)
            .orWhere(`${TableName.Certificate}.friendlyName`, "like", `%${sanitizedValue}%`);

          if (isUuidV4(sanitizedValue)) {
            void qb.orWhere(`${TableName.Certificate}.id`, sanitizedValue);
          }
        });
      }

      if (status) {
        const now = new Date();
        const statuses = Array.isArray(status) ? status : [status];

        query = query.andWhere((qb) => {
          statuses.forEach((statusValue, index) => {
            const whereMethod = index === 0 ? "where" : "orWhere";

            if (statusValue === CertStatus.ACTIVE) {
              void qb[whereMethod]((innerQb) => {
                void innerQb
                  .where(`${TableName.Certificate}.notAfter`, ">", now)
                  .andWhere(`${TableName.Certificate}.status`, "!=", CertStatus.REVOKED);
              });
            } else if (statusValue === CertStatus.EXPIRED) {
              void qb[whereMethod]((innerQb) => {
                void innerQb
                  .where(`${TableName.Certificate}.notAfter`, "<=", now)
                  .andWhere(`${TableName.Certificate}.status`, "!=", CertStatus.REVOKED);
              });
            } else {
              void qb[whereMethod](`${TableName.Certificate}.status`, statusValue);
            }
          });
        });
      }

      if (fromDate) {
        query = query.andWhere(`${TableName.Certificate}.createdAt`, ">=", fromDate);
      }

      if (toDate) {
        query = query.andWhere(`${TableName.Certificate}.createdAt`, "<=", toDate);
      }

      if (profileIds) {
        query = query.whereIn(`${TableName.Certificate}.profileId`, profileIds);
      }

      if (metadataFilter && metadataFilter.length > 0) {
        query = applyMetadataFilter(query, metadataFilter, "certificateId", TableName.Certificate);
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
            const sanitizedValue = sanitizeSqlLikeString(String(value));
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
        const sanitizedValue = sanitizeSqlLikeString(friendlyName);
        query = query.andWhere(`${TableName.Certificate}.friendlyName`, "like", `%${sanitizedValue}%`);
      }

      if (commonName) {
        const sanitizedValue = sanitizeSqlLikeString(commonName);
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
    filter: Partial<
      TCertificates & {
        friendlyName?: string;
        commonName?: string;
        search?: string;
        status?: string | string[];
        profileIds?: string[];
        fromDate?: Date;
        toDate?: Date;
        metadataFilter?: Array<{ key: string; value?: string }>;
      }
    >,
    options?: { offset?: number; limit?: number; sort?: [string, "asc" | "desc"][] },
    permissionFilters?: ProcessedPermissionRules
  ): Promise<(TCertificates & { hasPrivateKey: boolean })[]> => {
    try {
      let query = db
        .replicaNode()(TableName.Certificate)
        .leftJoin(TableName.CertificateSecret, `${TableName.Certificate}.id`, `${TableName.CertificateSecret}.certId`)
        .select(selectAllTableCols(TableName.Certificate))
        .select(db.ref(`${TableName.CertificateSecret}.certId`).as("privateKeyRef"));

      const {
        friendlyName,
        commonName,
        search,
        status,
        profileIds,
        fromDate,
        toDate,
        metadataFilter,
        ...regularFilters
      } = filter;

      Object.entries(regularFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.andWhere(`${TableName.Certificate}.${key}`, value);
        }
      });

      if (friendlyName) {
        const sanitizedValue = sanitizeSqlLikeString(friendlyName);
        query = query.andWhere(`${TableName.Certificate}.friendlyName`, "like", `%${sanitizedValue}%`);
      }

      if (commonName) {
        const sanitizedValue = sanitizeSqlLikeString(commonName);
        query = query.andWhere(`${TableName.Certificate}.commonName`, "like", `%${sanitizedValue}%`);
      }

      if (search) {
        const sanitizedValue = sanitizeSqlLikeString(search);
        query = query.andWhere((qb) => {
          void qb
            .where(`${TableName.Certificate}.commonName`, "like", `%${sanitizedValue}%`)
            .orWhere(`${TableName.Certificate}.altNames`, "like", `%${sanitizedValue}%`)
            .orWhere(`${TableName.Certificate}.serialNumber`, "like", `%${sanitizedValue}%`)
            .orWhere(`${TableName.Certificate}.friendlyName`, "like", `%${sanitizedValue}%`);

          if (isUuidV4(sanitizedValue)) {
            void qb.orWhere(`${TableName.Certificate}.id`, sanitizedValue);
          }
        });
      }

      if (status) {
        const now = new Date();
        const statuses = Array.isArray(status) ? status : [status];

        query = query.andWhere((qb) => {
          statuses.forEach((statusValue, index) => {
            const whereMethod = index === 0 ? "where" : "orWhere";

            if (statusValue === CertStatus.ACTIVE) {
              void qb[whereMethod]((innerQb) => {
                void innerQb
                  .where(`${TableName.Certificate}.notAfter`, ">", now)
                  .andWhere(`${TableName.Certificate}.status`, "!=", CertStatus.REVOKED);
              });
            } else if (statusValue === CertStatus.EXPIRED) {
              void qb[whereMethod]((innerQb) => {
                void innerQb
                  .where(`${TableName.Certificate}.notAfter`, "<=", now)
                  .andWhere(`${TableName.Certificate}.status`, "!=", CertStatus.REVOKED);
              });
            } else {
              void qb[whereMethod](`${TableName.Certificate}.status`, statusValue);
            }
          });
        });
      }

      if (fromDate) {
        query = query.andWhere(`${TableName.Certificate}.createdAt`, ">=", fromDate);
      }

      if (toDate) {
        query = query.andWhere(`${TableName.Certificate}.createdAt`, "<=", toDate);
      }

      if (profileIds) {
        query = query.whereIn(`${TableName.Certificate}.profileId`, profileIds);
      }

      if (metadataFilter && metadataFilter.length > 0) {
        query = applyMetadataFilter(query, metadataFilter, "certificateId", TableName.Certificate);
      }

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

  type TCertificateWithRequestDetails = TCertificates & {
    caName?: string | null;
    profileName?: string | null;
    caType?: "internal" | "external" | null;
  };

  // Flexible lookup filter for certificate queries - either id or serialNumber, not both
  type TCertificateLookupFilter = { id: string; serialNumber?: never } | { id?: never; serialNumber: string };

  const findWithFullDetails = async (
    filter: TCertificateLookupFilter,
    tx?: Knex
  ): Promise<TCertificateWithRequestDetails | undefined> => {
    try {
      let query = (tx || db)
        .replicaNode()(TableName.Certificate)
        .leftJoin(
          TableName.CertificateAuthority,
          `${TableName.Certificate}.caId`,
          `${TableName.CertificateAuthority}.id`
        )
        .leftJoin(
          TableName.PkiCertificateProfile,
          `${TableName.Certificate}.profileId`,
          `${TableName.PkiCertificateProfile}.id`
        )
        .leftJoin(
          TableName.InternalCertificateAuthority,
          `${TableName.CertificateAuthority}.id`,
          `${TableName.InternalCertificateAuthority}.caId`
        )
        .select(selectAllTableCols(TableName.Certificate))
        .select(db.ref("name").withSchema(TableName.CertificateAuthority).as("caName"))
        .select(db.ref("slug").withSchema(TableName.PkiCertificateProfile).as("profileName"))
        .select(db.ref("id").withSchema(TableName.InternalCertificateAuthority).as("internalCaId"));

      // Dynamic where clause based on filter
      if (filter.id) {
        query = query.where(`${TableName.Certificate}.id`, filter.id);
      } else {
        query = query.where(`${TableName.Certificate}.serialNumber`, filter.serialNumber);
      }

      const result = (await query.first()) as
        | (TCertificateWithRequestDetails & { internalCaId?: string | null })
        | undefined;

      if (!result) {
        return undefined;
      }

      const { internalCaId, ...rest } = result;

      let caType: "internal" | "external" | null = null;
      if (result.caId) {
        caType = internalCaId ? "internal" : "external";
      }

      return { ...rest, caType } as TCertificateWithRequestDetails;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate with full details" });
    }
  };

  const findByIdWithMetadata = async (id: string, tx?: Knex) => {
    try {
      const query = (tx || db.replicaNode())(TableName.Certificate)
        .leftJoin(
          TableName.ResourceMetadata,
          `${TableName.ResourceMetadata}.certificateId`,
          `${TableName.Certificate}.id`
        )
        .select(selectAllTableCols(TableName.Certificate))
        .select(
          db.ref("id").withSchema(TableName.ResourceMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.ResourceMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.ResourceMetadata).as("metadataValue")
        )
        .where(`${TableName.Certificate}.id`, id);

      const docs = sqlNestRelationships({
        data: await query,
        key: "id",
        parentMapper: (el) => el,
        childrenMapper: [
          {
            key: "metadataId",
            label: "metadata" as const,
            mapper: ({ metadataKey, metadataValue, metadataId }) => ({
              id: metadataId,
              key: metadataKey,
              value: metadataValue || ""
            })
          }
        ]
      });

      return docs[0] as (TCertificates & { metadata: { id: string; key: string; value: string }[] }) | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate by ID with metadata" });
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
    findWithPrivateKeyInfo,
    findWithFullDetails,
    findByIdWithMetadata
  };
};
