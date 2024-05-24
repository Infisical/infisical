import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TIdentityAccessTokens } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TIdentityAccessTokenDALFactory = ReturnType<typeof identityAccessTokenDALFactory>;

export const identityAccessTokenDALFactory = (db: TDbClient) => {
  const identityAccessTokenOrm = ormify(db, TableName.IdentityAccessToken);

  const findOne = async (filter: Partial<TIdentityAccessTokens>, tx?: Knex) => {
    try {
      const doc = await (tx || db)(TableName.IdentityAccessToken)
        .where(filter)
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.IdentityAccessToken}.identityId`)
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

  const removeExpiredTokens = async (tx?: Knex) => {
    try {
      const docs = (tx || db)(TableName.IdentityAccessToken)
        .where({
          isAccessTokenRevoked: true
        })
        .orWhere((qb) => {
          void qb
            .where("accessTokenNumUsesLimit", ">", 0)
            .andWhere(
              "accessTokenNumUses",
              ">=",
              db.ref("accessTokenNumUsesLimit").withSchema(TableName.IdentityAccessToken)
            );
        })
        .orWhere((qb) => {
          void qb.where("accessTokenTTL", ">", 0).andWhere((qb2) => {
            void qb2
              .where((qb3) => {
                void qb3
                  .whereNotNull("accessTokenLastRenewedAt")
                  // accessTokenLastRenewedAt + convert_integer_to_seconds(accessTokenTTL) < present_date
                  .andWhereRaw(
                    `"${TableName.IdentityAccessToken}"."accessTokenLastRenewedAt" + make_interval(secs => "${TableName.IdentityAccessToken}"."accessTokenTTL") < NOW()`
                  );
              })
              .orWhere((qb3) => {
                void qb3
                  .whereNull("accessTokenLastRenewedAt")
                  // created + convert_integer_to_seconds(accessTokenTTL) < present_date
                  .andWhereRaw(
                    `"${TableName.IdentityAccessToken}"."createdAt" + make_interval(secs => "${TableName.IdentityAccessToken}"."accessTokenTTL") < NOW()`
                  );
              });
          });
        })
        .delete();
      return await docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "IdentityAccessTokenPrune" });
    }
  };

  return { ...identityAccessTokenOrm, findOne, removeExpiredTokens };
};
