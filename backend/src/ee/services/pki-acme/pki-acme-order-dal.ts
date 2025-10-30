import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";

export type TPkiAcmeOrderDALFactory = ReturnType<typeof pkiAcmeOrderDALFactory>;

export const pkiAcmeOrderDALFactory = (db: TDbClient) => {
  const pkiAcmeOrderOrm = ormify(db, TableName.PkiAcmeOrder);

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
              identifierType: identifierType,
              identifierValue: identifierValue,
              expiresAt: authExpiresAt
            })
          }
        ]
      })?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI ACME order by id" });
    }
  };

  return {
    ...pkiAcmeOrderOrm,
    findByAccountAndOrderIdWithAuthorizations
  };
};
