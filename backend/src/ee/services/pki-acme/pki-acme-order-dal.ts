import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { CertificateRequestStatus } from "@app/services/certificate-request/certificate-request-types";

export type TPkiAcmeOrderDALFactory = ReturnType<typeof pkiAcmeOrderDALFactory>;

export const pkiAcmeOrderDALFactory = (db: TDbClient) => {
  const pkiAcmeOrderOrm = ormify(db, TableName.PkiAcmeOrder);

  const findByIdForFinalization = async (id: string, tx?: Knex) => {
    try {
      const order = await (tx || db)(TableName.PkiAcmeOrder).forUpdate().where({ id }).first();
      return order || null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI ACME order by id for finalization" });
    }
  };

  const findWithCertificateRequestForSync = async (id: string, tx?: Knex) => {
    try {
      const order = await (tx || db)(TableName.PkiAcmeOrder)
        .leftJoin(
          TableName.CertificateRequests,
          `${TableName.PkiAcmeOrder}.id`,
          `${TableName.CertificateRequests}.acmeOrderId`
        )
        .select(
          selectAllTableCols(TableName.PkiAcmeOrder),
          db.ref("id").withSchema(TableName.CertificateRequests).as("certificateRequestId"),
          db.ref("status").withSchema(TableName.CertificateRequests).as("certificateRequestStatus"),
          db.ref("certificateId").withSchema(TableName.CertificateRequests).as("certificateId")
        )
        .forUpdate(TableName.PkiAcmeOrder)
        .where(`${TableName.PkiAcmeOrder}.id`, id)
        .first();
      if (!order) {
        return null;
      }
      const { certificateRequestId, certificateRequestStatus, certificateId, ...details } = order;
      return {
        ...details,
        certificateRequest:
          certificateRequestId && certificateRequestStatus && certificateId
            ? {
                id: certificateRequestId,
                status: certificateRequestStatus as CertificateRequestStatus,
                certificateId
              }
            : undefined
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI ACME order by id with certificate request" });
    }
  };

  const findByAccountAndOrderIdWithAuthorizations = async (accountId: string, orderId: string, tx?: Knex) => {
    try {
      const rows = await (tx || db)(TableName.PkiAcmeOrder)
        .join(TableName.PkiAcmeOrderAuth, `${TableName.PkiAcmeOrderAuth}.orderId`, `${TableName.PkiAcmeOrder}.id`)
        .join(TableName.PkiAcmeAuth, `${TableName.PkiAcmeOrderAuth}.authId`, `${TableName.PkiAcmeAuth}.id`)
        .select(
          selectAllTableCols(TableName.PkiAcmeOrder),
          db.ref("id").withSchema(TableName.PkiAcmeAuth).as("authId"),
          db.ref("identifierType").withSchema(TableName.PkiAcmeAuth).as("identifierType"),
          db.ref("identifierValue").withSchema(TableName.PkiAcmeAuth).as("identifierValue"),
          db.ref("expiresAt").withSchema(TableName.PkiAcmeAuth).as("authExpiresAt")
        )
        .where(`${TableName.PkiAcmeOrder}.id`, orderId)
        .where(`${TableName.PkiAcmeOrder}.accountId`, accountId)
        .orderBy(`${TableName.PkiAcmeAuth}.identifierValue`, "asc");

      if (rows.length === 0) {
        return null;
      }
      return sqlNestRelationships({
        data: rows,
        key: "id",
        parentMapper: (row) => row,
        childrenMapper: [
          {
            key: "authId",
            label: "authorizations" as const,
            mapper: ({ authId, identifierType, identifierValue, authExpiresAt }) => ({
              id: authId,
              identifierType,
              identifierValue,
              expiresAt: authExpiresAt
            })
          }
        ]
      })?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI ACME order by id" });
    }
  };

  const listByAccountId = async (accountId: string, tx?: Knex) => {
    try {
      const orders = await (tx || db)(TableName.PkiAcmeOrder).where({ accountId }).orderBy("createdAt", "desc");
      return orders;
    } catch (error) {
      throw new DatabaseError({ error, name: "List PKI ACME orders by account id" });
    }
  };

  return {
    ...pkiAcmeOrderOrm,
    findByIdForFinalization,
    findWithCertificateRequestForSync,
    findByAccountAndOrderIdWithAuthorizations,
    listByAccountId
  };
};
