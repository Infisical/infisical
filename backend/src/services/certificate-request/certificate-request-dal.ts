import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TCertificateRequests, TCertificates } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn/string";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import {
  applyProcessedPermissionRulesToQuery,
  type ProcessedPermissionRules
} from "@app/lib/knex/permission-filter-utils";

type TCertificateRequestWithCertificate = TCertificateRequests & {
  certificate: TCertificates | null;
  profileName: string | null;
};

type TCertificateRequestQueryResult = TCertificateRequests & {
  certId: string | null;
  certSerialNumber: string | null;
  certStatus: string | null;
  profileName: string | null;
};

export type TCertificateRequestDALFactory = ReturnType<typeof certificateRequestDALFactory>;

export const certificateRequestDALFactory = (db: TDbClient) => {
  const certificateRequestOrm = ormify(db, TableName.CertificateRequests);

  const findByIdWithCertificate = async (id: string): Promise<TCertificateRequestWithCertificate | null> => {
    try {
      const result = (await db(TableName.CertificateRequests)
        .leftJoin(
          TableName.Certificate,
          `${TableName.CertificateRequests}.certificateId`,
          `${TableName.Certificate}.id`
        )
        .leftJoin(
          TableName.PkiCertificateProfile,
          `${TableName.CertificateRequests}.profileId`,
          `${TableName.PkiCertificateProfile}.id`
        )
        .where(`${TableName.CertificateRequests}.id`, id)
        .select(selectAllTableCols(TableName.CertificateRequests))
        .select(db.ref("slug").withSchema(TableName.PkiCertificateProfile).as("profileName"))
        .select(db.ref("id").withSchema(TableName.Certificate).as("certId"))
        .select(db.ref("serialNumber").withSchema(TableName.Certificate).as("certSerialNumber"))
        .select(db.ref("status").withSchema(TableName.Certificate).as("certStatus"))
        .first()) as TCertificateRequestQueryResult | undefined;

      if (!result) return null;

      const { certId, certSerialNumber, certStatus, profileName, ...certificateRequestData } = result;

      const certificate: TCertificates | null = certId
        ? ({
            id: certId,
            serialNumber: certSerialNumber,
            status: certStatus
          } as TCertificates)
        : null;

      return {
        ...certificateRequestData,
        profileName: profileName || null,
        certificate
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate request by ID with certificate" });
    }
  };

  const findPendingByProjectId = async (projectId: string): Promise<TCertificateRequests[]> => {
    try {
      return (await db(TableName.CertificateRequests)
        .where({ projectId, status: "pending" })
        .orderBy("createdAt", "desc")) as TCertificateRequests[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find pending certificate requests by project ID" });
    }
  };

  const updateStatus = async (
    id: string,
    status: string,
    errorMessage?: string,
    tx?: Knex
  ): Promise<TCertificateRequests> => {
    try {
      const updateData: Partial<TCertificateRequests> = { status };
      if (errorMessage !== undefined) {
        updateData.errorMessage = errorMessage;
      }
      return await certificateRequestOrm.updateById(id, updateData, tx);
    } catch (error) {
      throw new DatabaseError({ error, name: "Update certificate request status" });
    }
  };

  const attachCertificate = async (id: string, certificateId: string, tx?: Knex): Promise<TCertificateRequests> => {
    try {
      return await certificateRequestOrm.updateById(
        id,
        {
          certificateId,
          status: "issued"
        },
        tx
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Attach certificate to request" });
    }
  };

  const findByProjectId = async (
    projectId: string,
    options: {
      offset?: number;
      limit?: number;
      search?: string;
      status?: string;
      fromDate?: Date;
      toDate?: Date;
      profileIds?: string[];
    } = {},
    processedRules?: ProcessedPermissionRules,
    tx?: Knex
  ): Promise<TCertificateRequests[]> => {
    try {
      const { offset = 0, limit = 20, search, status, fromDate, toDate, profileIds } = options;

      let query = (tx || db)(TableName.CertificateRequests)
        .leftJoin(
          TableName.PkiCertificateProfile,
          `${TableName.CertificateRequests}.profileId`,
          `${TableName.PkiCertificateProfile}.id`
        )
        .where(`${TableName.CertificateRequests}.projectId`, projectId);

      if (profileIds && profileIds.length > 0) {
        query = query.whereIn(`${TableName.CertificateRequests}.profileId`, profileIds);
      }

      if (search) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const sanitizedSearch = sanitizeSqlLikeString(search);
        query = query.where((builder) => {
          void builder
            .whereILike(`${TableName.CertificateRequests}.commonName`, `%${sanitizedSearch}%`)
            .orWhereILike(`${TableName.CertificateRequests}.altNames`, `%${sanitizedSearch}%`);
        });
      }

      if (status) {
        query = query.where(`${TableName.CertificateRequests}.status`, status);
      }

      if (fromDate) {
        query = query.where(`${TableName.CertificateRequests}.createdAt`, ">=", fromDate);
      }

      if (toDate) {
        query = query.where(`${TableName.CertificateRequests}.createdAt`, "<=", toDate);
      }

      query = query
        .select(selectAllTableCols(TableName.CertificateRequests))
        .select(db.ref("slug").withSchema(TableName.PkiCertificateProfile).as("profileName"));

      if (processedRules) {
        query = applyProcessedPermissionRulesToQuery(
          query,
          TableName.CertificateRequests,
          processedRules
        ) as typeof query;
      }

      const certificateRequests = await query.orderBy("createdAt", "desc").offset(offset).limit(limit);

      return certificateRequests;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate requests by project ID" });
    }
  };

  const countByProjectId = async (
    projectId: string,
    options: {
      search?: string;
      status?: string;
      fromDate?: Date;
      toDate?: Date;
      profileIds?: string[];
    } = {},
    processedRules?: ProcessedPermissionRules,
    tx?: Knex
  ): Promise<number> => {
    try {
      const { search, status, fromDate, toDate, profileIds } = options;

      let query = (tx || db)(TableName.CertificateRequests)
        .leftJoin(
          TableName.PkiCertificateProfile,
          `${TableName.CertificateRequests}.profileId`,
          `${TableName.PkiCertificateProfile}.id`
        )
        .where(`${TableName.CertificateRequests}.projectId`, projectId);
      if (profileIds && profileIds.length > 0) {
        query = query.whereIn(`${TableName.CertificateRequests}.profileId`, profileIds);
      }

      if (search) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const sanitizedSearch = sanitizeSqlLikeString(search);
        query = query.where((builder) => {
          void builder
            .whereILike(`${TableName.CertificateRequests}.commonName`, `%${sanitizedSearch}%`)
            .orWhereILike(`${TableName.CertificateRequests}.altNames`, `%${sanitizedSearch}%`);
        });
      }

      if (status) {
        query = query.where(`${TableName.CertificateRequests}.status`, status);
      }

      if (fromDate) {
        query = query.where(`${TableName.CertificateRequests}.createdAt`, ">=", fromDate);
      }

      if (toDate) {
        query = query.where(`${TableName.CertificateRequests}.createdAt`, "<=", toDate);
      }

      if (processedRules) {
        query = applyProcessedPermissionRulesToQuery(
          query,
          TableName.CertificateRequests,
          processedRules
        ) as typeof query;
      }

      const result = await query.count("*").first();
      const count = (result as unknown as Record<string, unknown>)?.count;
      return parseInt(String(count || "0"), 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count certificate requests by project ID" });
    }
  };

  const findByProjectIdWithCertificate = async (
    projectId: string,
    options: {
      offset?: number;
      limit?: number;
      search?: string;
      status?: string;
      fromDate?: Date;
      toDate?: Date;
      profileIds?: string[];
      sortBy?: string;
      sortOrder?: "asc" | "desc";
    } = {},
    processedRules?: ProcessedPermissionRules,
    tx?: Knex
  ): Promise<TCertificateRequestWithCertificate[]> => {
    try {
      const {
        offset = 0,
        limit = 20,
        search,
        status,
        fromDate,
        toDate,
        profileIds,
        sortBy = "createdAt",
        sortOrder = "desc"
      } = options;

      let query: Knex.QueryBuilder = (tx || db)(TableName.CertificateRequests)
        .leftJoin(
          TableName.Certificate,
          `${TableName.CertificateRequests}.certificateId`,
          `${TableName.Certificate}.id`
        )
        .leftJoin(
          TableName.PkiCertificateProfile,
          `${TableName.CertificateRequests}.profileId`,
          `${TableName.PkiCertificateProfile}.id`
        );

      if (profileIds && profileIds.length > 0) {
        query = query.whereIn(`${TableName.CertificateRequests}.profileId`, profileIds);
      }

      query = query
        .select(selectAllTableCols(TableName.CertificateRequests))
        .select(db.ref("slug").withSchema(TableName.PkiCertificateProfile).as("profileName"))
        .select(db.ref("id").withSchema(TableName.Certificate).as("certId"))
        .select(db.ref("serialNumber").withSchema(TableName.Certificate).as("certSerialNumber"))
        .select(db.ref("status").withSchema(TableName.Certificate).as("certStatus"))
        .where(`${TableName.CertificateRequests}.projectId`, projectId);

      if (search) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const sanitizedSearch = sanitizeSqlLikeString(search);
        query = query.where((builder) => {
          void builder
            .whereILike(`${TableName.CertificateRequests}.commonName`, `%${sanitizedSearch}%`)
            .orWhereILike(`${TableName.CertificateRequests}.altNames`, `%${sanitizedSearch}%`);
        });
      }

      if (status) {
        query = query.where(`${TableName.CertificateRequests}.status`, status);
      }

      if (fromDate) {
        query = query.where(`${TableName.CertificateRequests}.createdAt`, ">=", fromDate);
      }

      if (toDate) {
        query = query.where(`${TableName.CertificateRequests}.createdAt`, "<=", toDate);
      }

      if (processedRules) {
        query = applyProcessedPermissionRulesToQuery(query, TableName.CertificateRequests, processedRules);
      }

      const allowedSortColumns = ["createdAt", "updatedAt", "status", "commonName"];
      const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : "createdAt";
      const safeSortOrder = sortOrder === "asc" || sortOrder === "desc" ? sortOrder : "desc";

      const results = (await query
        .orderBy(`${TableName.CertificateRequests}.${safeSortBy}`, safeSortOrder)
        .offset(offset)
        .limit(limit)) as TCertificateRequestQueryResult[];

      return results.map((row): TCertificateRequestWithCertificate => {
        const { certId, certSerialNumber, certStatus, profileName: rowProfileName, ...certificateRequestData } = row;

        const certificate: TCertificates | null = certId
          ? ({
              id: certId,
              serialNumber: certSerialNumber,
              status: certStatus
            } as TCertificates)
          : null;

        return {
          ...certificateRequestData,
          profileName: rowProfileName || null,
          certificate
        };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate requests by project ID with certificates" });
    }
  };

  return {
    ...certificateRequestOrm,
    findByIdWithCertificate,
    findPendingByProjectId,
    updateStatus,
    attachCertificate,
    findByProjectId,
    countByProjectId,
    findByProjectIdWithCertificate
  };
};
