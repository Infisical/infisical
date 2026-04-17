import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TCertificates } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn/string";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import {
  applyProcessedPermissionRulesToQuery,
  type ProcessedPermissionRules
} from "@app/lib/knex/permission-filter-utils";
import { isUuidV4 } from "@app/lib/validator";
import { applyMetadataFilter } from "@app/services/resource-metadata/resource-metadata-fns";

import { keySizeToAlgorithms } from "./certificate-fns";
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

  type TInventoryFilterParams = {
    friendlyName?: string;
    commonName?: string;
    search?: string;
    status?: string | string[];
    profileIds?: string[];
    fromDate?: Date;
    toDate?: Date;
    metadataFilter?: Array<{ key: string; value?: string }>;
    extendedKeyUsage?: string;
    keyAlgorithm?: string | string[];
    signatureAlgorithm?: string;
    keySizes?: number[];
    caIds?: string[];
    enrollmentTypes?: string[];
    source?: string | string[];
    notAfterFrom?: Date;
    notAfterTo?: Date;
    notBeforeFrom?: Date;
    notBeforeTo?: Date;
  };

  const applyInventoryFilters = (
    query: Knex.QueryBuilder,
    filters: TInventoryFilterParams,
    hasProfileJoin: boolean
  ): Knex.QueryBuilder => {
    let q = query;

    if (filters.friendlyName) {
      const sanitizedValue = sanitizeSqlLikeString(filters.friendlyName);
      q = q.andWhere(`${TableName.Certificate}.friendlyName`, "like", `%${sanitizedValue}%`);
    }

    if (filters.commonName) {
      const sanitizedValue = sanitizeSqlLikeString(filters.commonName);
      q = q.andWhere(`${TableName.Certificate}.commonName`, "like", `%${sanitizedValue}%`);
    }

    if (filters.search) {
      const sanitizedValue = sanitizeSqlLikeString(filters.search);
      q = q.andWhere((qb: Knex.QueryBuilder) => {
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

    if (filters.status) {
      const now = new Date();
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];

      q = q.andWhere((qb: Knex.QueryBuilder) => {
        statuses.forEach((statusValue, index) => {
          const whereMethod = index === 0 ? "where" : "orWhere";

          if (statusValue === CertStatus.ACTIVE) {
            void qb[whereMethod]((innerQb: Knex.QueryBuilder) => {
              void innerQb
                .where(`${TableName.Certificate}.notAfter`, ">", now)
                .andWhere(`${TableName.Certificate}.status`, "!=", CertStatus.REVOKED);
            });
          } else if (statusValue === CertStatus.EXPIRED) {
            void qb[whereMethod]((innerQb: Knex.QueryBuilder) => {
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

    if (filters.fromDate) {
      q = q.andWhere(`${TableName.Certificate}.createdAt`, ">=", filters.fromDate);
    }

    if (filters.toDate) {
      q = q.andWhere(`${TableName.Certificate}.createdAt`, "<=", filters.toDate);
    }

    if (filters.profileIds) {
      q = q.whereIn(`${TableName.Certificate}.profileId`, filters.profileIds);
    }

    if (filters.metadataFilter && filters.metadataFilter.length > 0) {
      q = applyMetadataFilter(q, filters.metadataFilter, "certificateId", TableName.Certificate);
    }

    if (filters.extendedKeyUsage) {
      q = q.whereRaw(`"${TableName.Certificate}"."extendedKeyUsages" @> ARRAY[?]::text[]`, [filters.extendedKeyUsage]);
    }

    if (filters.keyAlgorithm) {
      if (Array.isArray(filters.keyAlgorithm)) {
        q = q.whereIn(`${TableName.Certificate}.keyAlgorithm`, filters.keyAlgorithm);
      } else {
        q = q.andWhere(`${TableName.Certificate}.keyAlgorithm`, filters.keyAlgorithm);
      }
    }

    if (filters.signatureAlgorithm) {
      q = q.andWhere(`${TableName.Certificate}.signatureAlgorithm`, filters.signatureAlgorithm);
    }

    if (filters.keySizes && filters.keySizes.length > 0) {
      const allAlgorithms = filters.keySizes.flatMap((size) => keySizeToAlgorithms(size));
      q = q.whereIn(`${TableName.Certificate}.keyAlgorithm`, allAlgorithms);
    }

    if (filters.caIds) {
      q = q.whereIn(`${TableName.Certificate}.caId`, filters.caIds);
    }

    if (filters.enrollmentTypes && hasProfileJoin) {
      q = q.whereIn(`${TableName.PkiCertificateProfile}.enrollmentType`, filters.enrollmentTypes);
    }

    if (filters.source) {
      const sources = Array.isArray(filters.source) ? filters.source : [filters.source];
      const includesIssued = sources.includes("issued");
      const otherSources = sources.filter((s) => s !== "issued");

      q = q.andWhere((qb: Knex.QueryBuilder) => {
        if (otherSources.length > 0) {
          void qb.whereIn(`${TableName.Certificate}.source`, otherSources);
        }
        if (includesIssued) {
          void qb.orWhere(`${TableName.Certificate}.source`, "issued").orWhereNull(`${TableName.Certificate}.source`);
        }
      });
    }

    if (filters.notAfterFrom) {
      q = q.andWhere(`${TableName.Certificate}.notAfter`, ">=", filters.notAfterFrom);
    }

    if (filters.notAfterTo) {
      q = q.andWhere(`${TableName.Certificate}.notAfter`, "<=", filters.notAfterTo);
    }

    if (filters.notBeforeFrom) {
      q = q.andWhere(`${TableName.Certificate}.notBefore`, ">=", filters.notBeforeFrom);
    }

    if (filters.notBeforeTo) {
      q = q.andWhere(`${TableName.Certificate}.notBefore`, "<=", filters.notBeforeTo);
    }

    return q;
  };

  const countCertificatesInProject = async (
    {
      projectId,
      ...filters
    }: {
      projectId: string;
    } & TInventoryFilterParams,
    permissionFilters?: ProcessedPermissionRules
  ) => {
    try {
      interface CountResult {
        count: string;
      }

      let query = db
        .replicaNode()(TableName.Certificate)
        .join(TableName.CertificateAuthority, `${TableName.Certificate}.caId`, `${TableName.CertificateAuthority}.id`)
        .join(TableName.Project, `${TableName.CertificateAuthority}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.id`, projectId);

      const hasEnrollmentTypeFilter = Boolean(filters.enrollmentTypes);
      if (hasEnrollmentTypeFilter) {
        query = query.leftJoin(
          TableName.PkiCertificateProfile,
          `${TableName.Certificate}.profileId`,
          `${TableName.PkiCertificateProfile}.id`
        );
      }

      query = applyInventoryFilters(query, filters, hasEnrollmentTypeFilter) as typeof query;

      if (permissionFilters) {
        query = applyProcessedPermissionRulesToQuery(query, TableName.Certificate, permissionFilters) as typeof query;
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
    filter: Partial<Omit<TCertificates, "status" | "keyAlgorithm" | "source"> & TInventoryFilterParams>,
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

  type TCertificateWithInventoryFields = TCertificates & {
    hasPrivateKey: boolean;
    caName?: string | null;
    profileName?: string | null;
    enrollmentType?: string | null;
  };

  const findWithPrivateKeyInfo = async (
    filter: Partial<Omit<TCertificates, "status" | "keyAlgorithm" | "source"> & TInventoryFilterParams>,
    options?: { offset?: number; limit?: number; sort?: [string, "asc" | "desc"][] },
    permissionFilters?: ProcessedPermissionRules
  ): Promise<TCertificateWithInventoryFields[]> => {
    try {
      let query = db
        .replicaNode()(TableName.Certificate)
        .leftJoin(TableName.CertificateSecret, `${TableName.Certificate}.id`, `${TableName.CertificateSecret}.certId`)
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
        .select(selectAllTableCols(TableName.Certificate))
        .select(db.ref(`${TableName.CertificateSecret}.certId`).as("privateKeyRef"))
        .select(db.ref("name").withSchema(TableName.CertificateAuthority).as("caName"))
        .select(db.ref("slug").withSchema(TableName.PkiCertificateProfile).as("profileName"))
        .select(db.ref("enrollmentType").withSchema(TableName.PkiCertificateProfile).as("enrollmentType"));

      const {
        friendlyName,
        commonName,
        search,
        status,
        profileIds,
        fromDate,
        toDate,
        metadataFilter,
        extendedKeyUsage,
        keyAlgorithm,
        signatureAlgorithm,
        keySizes,
        caIds,
        enrollmentTypes,
        source,
        notAfterFrom,
        notAfterTo,
        notBeforeFrom,
        notBeforeTo,
        ...regularFilters
      } = filter;

      Object.entries(regularFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.andWhere(`${TableName.Certificate}.${key}`, value);
        }
      });

      query = applyInventoryFilters(
        query,
        {
          friendlyName,
          commonName,
          search,
          status,
          profileIds,
          fromDate,
          toDate,
          metadataFilter,
          extendedKeyUsage,
          keyAlgorithm,
          signatureAlgorithm,
          keySizes,
          caIds,
          enrollmentTypes,
          source,
          notAfterFrom,
          notAfterTo,
          notBeforeFrom,
          notBeforeTo
        },
        true
      ) as typeof query;

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
          query = query.orderBy(`${TableName.Certificate}.${column}`, direction);
        });
      }

      const results = await query;
      return results.map((row) => ({
        ...row,
        hasPrivateKey: row.privateKeyRef !== null
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificates with private key info" });
    }
  };

  type TCertificateWithRequestDetails = TCertificates & {
    caName?: string | null;
    profileName?: string | null;
    caType?: "internal" | "external" | null;
  };

  type TCertificateLookupFilter = { id: string; serialNumber?: never } | { id?: never; serialNumber: string };

  const findWithFullDetails = async (
    filter: TCertificateLookupFilter,
    tx?: Knex
  ): Promise<TCertificateWithRequestDetails | undefined> => {
    try {
      let query = (tx || db.replicaNode())(TableName.Certificate)
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

  const getDashboardStats = async (projectId: string) => {
    try {
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      interface TotalsRow {
        total: number;
        active: number;
        expiringSoon: number;
        expired: number;
        revoked: number;
        expiringSoonNoAutoRenewal: number;
        expiredNotRenewed: number;
      }

      interface LabelCount {
        label: string;
        count: string;
      }

      interface LabelCountWithId extends LabelCount {
        id: string;
      }

      interface BucketCount {
        bucket: string;
        count: string;
      }

      const [totalsRow] = await db
        .replicaNode()(TableName.Certificate)
        .join(TableName.CertificateAuthority, `${TableName.Certificate}.caId`, `${TableName.CertificateAuthority}.id`)
        .where(`${TableName.CertificateAuthority}.projectId`, projectId)
        .select(
          db.raw("COUNT(*)::int as total"),
          db.raw(
            `COUNT(*) FILTER (WHERE "${TableName.Certificate}"."notAfter" > ? AND "${TableName.Certificate}"."status" != ?)::int as active`,
            [now, CertStatus.REVOKED]
          ),
          db.raw(
            `COUNT(*) FILTER (WHERE "${TableName.Certificate}"."notAfter" > ? AND "${TableName.Certificate}"."notAfter" <= ? AND "${TableName.Certificate}"."status" != ?)::int as "expiringSoon"`,
            [now, thirtyDaysFromNow, CertStatus.REVOKED]
          ),
          db.raw(
            `COUNT(*) FILTER (WHERE "${TableName.Certificate}"."notAfter" <= ? AND "${TableName.Certificate}"."status" != ?)::int as expired`,
            [now, CertStatus.REVOKED]
          ),
          db.raw(`COUNT(*) FILTER (WHERE "${TableName.Certificate}"."status" = ?)::int as revoked`, [
            CertStatus.REVOKED
          ]),
          db.raw(
            `COUNT(*) FILTER (WHERE "${TableName.Certificate}"."notAfter" > ? AND "${TableName.Certificate}"."notAfter" <= ? AND "${TableName.Certificate}"."status" != ? AND "${TableName.Certificate}"."renewBeforeDays" IS NULL)::int as "expiringSoonNoAutoRenewal"`,
            [now, thirtyDaysFromNow, CertStatus.REVOKED]
          ),
          db.raw(
            `COUNT(*) FILTER (WHERE "${TableName.Certificate}"."notAfter" <= ? AND "${TableName.Certificate}"."status" != ? AND "${TableName.Certificate}"."renewedByCertificateId" IS NULL)::int as "expiredNotRenewed"`,
            [now, CertStatus.REVOKED]
          )
        );

      const totals = totalsRow as unknown as TotalsRow;

      const byAlgorithm = await db
        .replicaNode()(TableName.Certificate)
        .join(TableName.CertificateAuthority, `${TableName.Certificate}.caId`, `${TableName.CertificateAuthority}.id`)
        .where(`${TableName.CertificateAuthority}.projectId`, projectId)
        .select(`${TableName.Certificate}.keyAlgorithm as label`)
        .count("* as count")
        .groupBy(`${TableName.Certificate}.keyAlgorithm`);

      const byCA = await db
        .replicaNode()(TableName.Certificate)
        .join(TableName.CertificateAuthority, `${TableName.Certificate}.caId`, `${TableName.CertificateAuthority}.id`)
        .where(`${TableName.CertificateAuthority}.projectId`, projectId)
        .select(`${TableName.CertificateAuthority}.id as id`)
        .select(`${TableName.CertificateAuthority}.name as label`)
        .count("* as count")
        .groupBy(`${TableName.CertificateAuthority}.id`, `${TableName.CertificateAuthority}.name`);

      const byStatus = [
        { label: "Active", count: totals.active },
        { label: "Expired", count: totals.expired },
        { label: "Revoked", count: totals.revoked }
      ];

      const byEnrollmentMethod = await db
        .replicaNode()(TableName.Certificate)
        .join(TableName.CertificateAuthority, `${TableName.Certificate}.caId`, `${TableName.CertificateAuthority}.id`)
        .leftJoin(
          TableName.PkiCertificateProfile,
          `${TableName.Certificate}.profileId`,
          `${TableName.PkiCertificateProfile}.id`
        )
        .where(`${TableName.CertificateAuthority}.projectId`, projectId)
        .select(db.raw(`COALESCE("${TableName.PkiCertificateProfile}"."enrollmentType", 'API') as label`))
        .count("* as count")
        .groupBy("label");

      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
      const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

      const expirationBuckets = await db
        .replicaNode()(TableName.Certificate)
        .join(TableName.CertificateAuthority, `${TableName.Certificate}.caId`, `${TableName.CertificateAuthority}.id`)
        .where(`${TableName.CertificateAuthority}.projectId`, projectId)
        .where(`${TableName.Certificate}.status`, "!=", CertStatus.REVOKED)
        .select(
          db.raw(
            `CASE
              WHEN "${TableName.Certificate}"."notAfter" < ? THEN 'expired'
              WHEN "${TableName.Certificate}"."notAfter" <= ? THEN '0-7d'
              WHEN "${TableName.Certificate}"."notAfter" <= ? THEN '8-30d'
              WHEN "${TableName.Certificate}"."notAfter" <= ? THEN '31-60d'
              WHEN "${TableName.Certificate}"."notAfter" <= ? THEN '61-90d'
              ELSE '90d+'
            END as bucket`,
            [now, sevenDaysFromNow, thirtyDaysFromNow, sixtyDaysFromNow, ninetyDaysFromNow]
          )
        )
        .select(db.raw("count(*)::int as count"))
        .groupBy("bucket");

      const validityBuckets = await db
        .replicaNode()(TableName.Certificate)
        .where(`${TableName.Certificate}.projectId`, projectId)
        .where(`${TableName.Certificate}.status`, "!=", CertStatus.REVOKED)
        .where(`${TableName.Certificate}.notAfter`, ">", now)
        .whereRaw(`"${TableName.Certificate}"."extendedKeyUsages" @> ARRAY[?]::text[]`, ["serverAuth"])
        .select(
          db.raw(
            `CASE
              WHEN EXTRACT(EPOCH FROM ("${TableName.Certificate}"."notAfter" - "${TableName.Certificate}"."notBefore")) / 86400 <= 47 THEN '<=47d'
              WHEN EXTRACT(EPOCH FROM ("${TableName.Certificate}"."notAfter" - "${TableName.Certificate}"."notBefore")) / 86400 <= 99 THEN '48-99d'
              WHEN EXTRACT(EPOCH FROM ("${TableName.Certificate}"."notAfter" - "${TableName.Certificate}"."notBefore")) / 86400 <= 199 THEN '100-199d'
              ELSE '>=200d'
            END as bucket`
          )
        )
        .select(db.raw("count(*)::int as count"))
        .groupBy("bucket");

      return {
        totals: {
          total: totals.total,
          active: totals.active,
          expiringSoon: totals.expiringSoon,
          expired: totals.expired,
          revoked: totals.revoked
        },
        expiringSoonNoAutoRenewal: totals.expiringSoonNoAutoRenewal,
        expiredNotRenewed: totals.expiredNotRenewed,
        distributions: {
          byEnrollmentMethod: (byEnrollmentMethod as unknown as LabelCount[]).map((r) => ({
            label: r.label,
            count: Number(r.count)
          })),
          byAlgorithm: (byAlgorithm as unknown as LabelCount[]).map((r) => ({
            label: r.label,
            count: Number(r.count)
          })),
          byCA: (byCA as unknown as LabelCountWithId[]).map((r) => ({
            id: r.id,
            label: r.label || "Unknown",
            count: Number(r.count)
          })),
          byStatus
        },
        expirationBuckets: (expirationBuckets as unknown as BucketCount[]).map((r) => ({
          bucket: r.bucket,
          count: Number(r.count)
        })),
        validityBuckets: (validityBuckets as unknown as BucketCount[]).map((r) => ({
          bucket: r.bucket,
          count: Number(r.count)
        }))
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Get dashboard stats" });
    }
  };

  const getActivityTrend = async (projectId: string, daysBack: number) => {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);
      startDate.setHours(0, 0, 0, 0);
      const now = new Date();

      const useDaily = daysBack <= 30;

      if (!useDaily) {
        startDate.setDate(1);
      }
      const truncUnit = useDaily ? "day" : "month";
      const dateFormat = useDaily ? "YYYY-MM-DD" : "YYYY-MM";

      const periodExpr = (col: string) =>
        db.raw(`to_char(date_trunc(?, "${TableName.Certificate}"."${col}"), ?) as period`, [truncUnit, dateFormat]);

      const issued = await db
        .replicaNode()(TableName.Certificate)
        .join(TableName.CertificateAuthority, `${TableName.Certificate}.caId`, `${TableName.CertificateAuthority}.id`)
        .where(`${TableName.CertificateAuthority}.projectId`, projectId)
        .where(`${TableName.Certificate}.notBefore`, ">=", startDate)
        .where(`${TableName.Certificate}.notBefore`, "<=", now)
        .select(periodExpr("notBefore"))
        .select(db.raw("count(*)::int as count"))
        .groupBy("period")
        .orderBy("period");

      const expired = await db
        .replicaNode()(TableName.Certificate)
        .join(TableName.CertificateAuthority, `${TableName.Certificate}.caId`, `${TableName.CertificateAuthority}.id`)
        .where(`${TableName.CertificateAuthority}.projectId`, projectId)
        .where(`${TableName.Certificate}.notAfter`, ">=", startDate)
        .where(`${TableName.Certificate}.notAfter`, "<=", now)
        .where(`${TableName.Certificate}.status`, "!=", CertStatus.REVOKED)
        .select(periodExpr("notAfter"))
        .select(db.raw("count(*)::int as count"))
        .groupBy("period")
        .orderBy("period");

      const revoked = await db
        .replicaNode()(TableName.Certificate)
        .join(TableName.CertificateAuthority, `${TableName.Certificate}.caId`, `${TableName.CertificateAuthority}.id`)
        .where(`${TableName.CertificateAuthority}.projectId`, projectId)
        .where(`${TableName.Certificate}.status`, CertStatus.REVOKED)
        .where(`${TableName.Certificate}.revokedAt`, ">=", startDate)
        .where(`${TableName.Certificate}.revokedAt`, "<=", now)
        .select(periodExpr("revokedAt"))
        .select(db.raw("count(*)::int as count"))
        .groupBy("period")
        .orderBy("period");

      const renewed = await db
        .replicaNode()(TableName.Certificate)
        .join(TableName.CertificateAuthority, `${TableName.Certificate}.caId`, `${TableName.CertificateAuthority}.id`)
        .where(`${TableName.CertificateAuthority}.projectId`, projectId)
        .whereNotNull(`${TableName.Certificate}.renewedFromCertificateId`)
        .where(`${TableName.Certificate}.notBefore`, ">=", startDate)
        .where(`${TableName.Certificate}.notBefore`, "<=", now)
        .select(periodExpr("notBefore"))
        .select(db.raw("count(*)::int as count"))
        .groupBy("period")
        .orderBy("period");

      const periods: Array<{
        period: string;
        issued: number;
        expired: number;
        revoked: number;
        renewed: number;
      }> = [];
      interface PeriodCount {
        period: string;
        count: string;
      }

      const typedIssued = issued as unknown as PeriodCount[];
      const typedExpired = expired as unknown as PeriodCount[];
      const typedRevoked = revoked as unknown as PeriodCount[];
      const typedRenewed = renewed as unknown as PeriodCount[];

      const issuedMap = new Map(typedIssued.map((r) => [r.period, r.count]));
      const expiredMap = new Map(typedExpired.map((r) => [r.period, r.count]));
      const revokedMap = new Map(typedRevoked.map((r) => [r.period, r.count]));
      const renewedMap = new Map(typedRenewed.map((r) => [r.period, r.count]));

      const cursor = new Date(startDate);
      while (cursor <= now) {
        let periodKey: string;
        if (useDaily) {
          periodKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        } else {
          periodKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
        }
        const issuedCount = issuedMap.get(periodKey);
        const expiredCount = expiredMap.get(periodKey);
        const revokedCount = revokedMap.get(periodKey);
        const renewedCount = renewedMap.get(periodKey);
        periods.push({
          period: periodKey,
          issued: issuedCount ? Number(issuedCount) : 0,
          expired: expiredCount ? Number(expiredCount) : 0,
          revoked: revokedCount ? Number(revokedCount) : 0,
          renewed: renewedCount ? Number(renewedCount) : 0
        });
        if (useDaily) {
          cursor.setDate(cursor.getDate() + 1);
        } else {
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }

      return { periods };
    } catch (error) {
      throw new DatabaseError({ error, name: "Get activity trend" });
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
    getDashboardStats,
    getActivityTrend
  };
};
