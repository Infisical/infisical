import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";

export type TPkiAcmeAuthDALFactory = ReturnType<typeof pkiAcmeAuthDALFactory>;

export const pkiAcmeAuthDALFactory = (db: TDbClient) => {
  const pkiAcmeAuthOrm = ormify(db, TableName.PkiAcmeAuth);

  const findByAccountIdAndAuthIdWithChallenges = async (accountId: string, authId: string, tx?: Knex) => {
    try {
      const rows = await (tx || db)(TableName.PkiAcmeAuth)
        .leftJoin(TableName.PkiAcmeChallenge, `${TableName.PkiAcmeChallenge}.authId`, `${TableName.PkiAcmeAuth}.id`)
        .select(
          selectAllTableCols(TableName.PkiAcmeAuth),
          db.ref("id").withSchema(TableName.PkiAcmeChallenge).as("challengeId"),
          db.ref("type").withSchema(TableName.PkiAcmeChallenge).as("challengeType"),
          db.ref("status").withSchema(TableName.PkiAcmeChallenge).as("challengeStatus")
        )
        .where(`${TableName.PkiAcmeAuth}.accountId`, accountId)
        .where(`${TableName.PkiAcmeAuth}.id`, authId);

      if (rows.length === 0) {
        return null;
      }
      return sqlNestRelationships({
        data: rows,
        key: "id",
        parentMapper: (row) => row,
        childrenMapper: [
          {
            key: "challengeId",
            label: "challenges" as const,
            mapper: ({ challengeId, challengeType, challengeStatus }) => ({
              id: challengeId,
              type: challengeType,
              status: challengeStatus
            })
          }
        ]
      })?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI ACME auth by account id and auth id with challenges" });
    }
  };

  return {
    ...pkiAcmeAuthOrm,
    findByAccountIdAndAuthIdWithChallenges
  };
};
