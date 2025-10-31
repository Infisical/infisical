import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { Knex } from "knex";

export type TPkiAcmeChallengeDALFactory = ReturnType<typeof pkiAcmeChallengeDALFactory>;

export const pkiAcmeChallengeDALFactory = (db: TDbClient) => {
  const pkiAcmeChallengeOrm = ormify(db, TableName.PkiAcmeChallenge);

  const findByAccountAuthAndChallengeIdWithToken = async (
    accountId: string,
    authId: string,
    challengeId: string,
    tx?: Knex
  ) => {
    try {
      const challenge = await (tx || db)(TableName.PkiAcmeChallenge)
        .join(TableName.PkiAcmeAuth, `${TableName.PkiAcmeChallenge}.authId`, `${TableName.PkiAcmeAuth}.id`)
        .select(
          selectAllTableCols(TableName.PkiAcmeChallenge),
          db.ref("token").withSchema(TableName.PkiAcmeAuth).as("token")
        )
        .where(`${TableName.PkiAcmeChallenge}.id`, challengeId)
        .where(`${TableName.PkiAcmeChallenge}.authId`, authId)
        .where(`${TableName.PkiAcmeAuth}.accountId`, accountId)
        .first();
      if (!challenge) {
        return null;
      }
      return challenge;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI ACME challenge by account id, auth id and challenge id" });
    }
  };
  return {
    ...pkiAcmeChallengeOrm,
    findByAccountAuthAndChallengeIdWithToken
  };
};
