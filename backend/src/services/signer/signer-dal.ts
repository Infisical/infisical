import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn/string";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TSignerDALFactory = ReturnType<typeof signerDALFactory>;

export const signerDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.Signers);

  const findByIdWithCertificate = async (signerId: string, tx?: Knex) => {
    try {
      const query: Knex.QueryBuilder = (tx || db.replicaNode())(TableName.Signers)
        .leftJoin(TableName.Certificate, `${TableName.Signers}.certificateId`, `${TableName.Certificate}.id`)
        .leftJoin(
          TableName.ApprovalPolicies,
          `${TableName.Signers}.approvalPolicyId`,
          `${TableName.ApprovalPolicies}.id`
        )
        .select(selectAllTableCols(TableName.Signers))
        .select(
          db.ref("commonName").withSchema(TableName.Certificate).as("certificateCommonName"),
          db.ref("serialNumber").withSchema(TableName.Certificate).as("certificateSerialNumber"),
          db.ref("notAfter").withSchema(TableName.Certificate).as("certificateNotAfter"),
          db.ref("notBefore").withSchema(TableName.Certificate).as("certificateNotBefore"),
          db.ref("keyAlgorithm").withSchema(TableName.Certificate).as("certificateKeyAlgorithm"),
          db.ref("status").withSchema(TableName.Certificate).as("certificateStatus"),
          db.ref("caId").withSchema(TableName.Certificate).as("certificateCaId"),
          db.ref("name").withSchema(TableName.ApprovalPolicies).as("approvalPolicyName")
        )
        .where(`${TableName.Signers}.id`, signerId)
        .first();

      return await query;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSignerByIdWithCertificate" });
    }
  };

  const findByProjectId = async (
    projectId: string,
    {
      offset = 0,
      limit = 25,
      search
    }: {
      offset?: number;
      limit?: number;
      search?: string;
    },
    tx?: Knex
  ) => {
    try {
      let query: Knex.QueryBuilder = (tx || db.replicaNode())(TableName.Signers)
        .leftJoin(TableName.Certificate, `${TableName.Signers}.certificateId`, `${TableName.Certificate}.id`)
        .leftJoin(
          TableName.ApprovalPolicies,
          `${TableName.Signers}.approvalPolicyId`,
          `${TableName.ApprovalPolicies}.id`
        )
        .select(selectAllTableCols(TableName.Signers))
        .select(
          db.ref("commonName").withSchema(TableName.Certificate).as("certificateCommonName"),
          db.ref("serialNumber").withSchema(TableName.Certificate).as("certificateSerialNumber"),
          db.ref("notAfter").withSchema(TableName.Certificate).as("certificateNotAfter"),
          db.ref("name").withSchema(TableName.ApprovalPolicies).as("approvalPolicyName")
        )
        .where(`${TableName.Signers}.projectId`, projectId);

      if (search) {
        const sanitizedSearch = `%${sanitizeSqlLikeString(search)}%`;
        query = query.where((qb) => {
          void qb
            .whereILike(`${TableName.Signers}.name`, sanitizedSearch)
            .orWhereILike(`${TableName.Certificate}.commonName`, sanitizedSearch);
        });
      }

      return await query.orderBy(`${TableName.Signers}.createdAt`, "desc").offset(offset).limit(limit);
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSignersByProjectId" });
    }
  };

  const countByProjectId = async (projectId: string, search?: string, tx?: Knex) => {
    try {
      let query: Knex.QueryBuilder = (tx || db.replicaNode())(TableName.Signers).where(
        `${TableName.Signers}.projectId`,
        projectId
      );

      if (search) {
        const sanitizedSearch = `%${sanitizeSqlLikeString(search)}%`;
        query = query
          .leftJoin(TableName.Certificate, `${TableName.Signers}.certificateId`, `${TableName.Certificate}.id`)
          .where((qb) => {
            void qb
              .whereILike(`${TableName.Signers}.name`, sanitizedSearch)
              .orWhereILike(`${TableName.Certificate}.commonName`, sanitizedSearch);
          });
      }

      const [result] = await query.count("* as count");
      return Number((result as unknown as { count: string | number }).count);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountSignersByProjectId" });
    }
  };

  return { ...orm, findByIdWithCertificate, findByProjectId, countByProjectId };
};
