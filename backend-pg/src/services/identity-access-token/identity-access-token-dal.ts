import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName,TIdentityAccessTokens } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TIdentityAccessTokenDalFactory = ReturnType<typeof identityAccessTokenDalFactory>;

export const identityAccessTokenDalFactory = (db: TDbClient) => {
  const identityAccessTokenOrm = ormify(db, TableName.IdentityAccessToken);

  const findOne = async (filter: Partial<TIdentityAccessTokens>, tx?: Knex) => {
    try {
      const doc = await (tx || db)(TableName.IdentityAccessToken)
        .where(filter)
        .join(
          TableName.Identity,
          `${TableName.Identity}.id`,
          `${TableName.IdentityAccessToken}.identityId`
        )
        .leftJoin(
          TableName.IdentityUaClientSecret,
          `${TableName.IdentityAccessToken}.identityUAClientSecretId`,
          `${TableName.IdentityUaClientSecret}.id`
        )
        .leftJoin(
          TableName.IdentityUniversalAuth,
          `${TableName.IdentityUaClientSecret}.identityUAId`,
          `${TableName.IdentityUniversalAuth}.id`
        )
        .select(selectAllTableCols(TableName.IdentityAccessToken))
        .select(
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityUniversalAuth),
          db.ref("name").withSchema(TableName.Identity)
        )
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "IdAccessTokenFindOne" });
    }
  };

  return { ...identityAccessTokenOrm, findOne };
};
