import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TIdentityAccessTokens } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { logger } from "@app/lib/logger";
import { QueueName } from "@app/queue";

export type TIdentityAccessTokenDALFactory = ReturnType<typeof identityAccessTokenDALFactory>;

export const identityAccessTokenDALFactory = (db: TDbClient) => {
  const identityAccessTokenOrm = ormify(db, TableName.IdentityAccessToken);

  const findOne = async (filter: Partial<TIdentityAccessTokens>, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.IdentityAccessToken)
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
        .leftJoin(TableName.IdentityGcpAuth, `${TableName.Identity}.id`, `${TableName.IdentityGcpAuth}.identityId`)
        .leftJoin(TableName.IdentityAwsAuth, `${TableName.Identity}.id`, `${TableName.IdentityAwsAuth}.identityId`)
        .leftJoin(TableName.IdentityAzureAuth, `${TableName.Identity}.id`, `${TableName.IdentityAzureAuth}.identityId`)
        .leftJoin(TableName.IdentityLdapAuth, `${TableName.Identity}.id`, `${TableName.IdentityLdapAuth}.identityId`)
        .leftJoin(
          TableName.IdentityKubernetesAuth,
          `${TableName.Identity}.id`,
          `${TableName.IdentityKubernetesAuth}.identityId`
        )
        .leftJoin(TableName.IdentityOidcAuth, `${TableName.Identity}.id`, `${TableName.IdentityOidcAuth}.identityId`)
        .leftJoin(TableName.IdentityTokenAuth, `${TableName.Identity}.id`, `${TableName.IdentityTokenAuth}.identityId`)
        .leftJoin(TableName.IdentityJwtAuth, `${TableName.Identity}.id`, `${TableName.IdentityJwtAuth}.identityId`)
        .select(selectAllTableCols(TableName.IdentityAccessToken))
        .select(
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityUniversalAuth).as("accessTokenTrustedIpsUa"),
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityGcpAuth).as("accessTokenTrustedIpsGcp"),
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityAwsAuth).as("accessTokenTrustedIpsAws"),
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityAzureAuth).as("accessTokenTrustedIpsAzure"),
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityKubernetesAuth).as("accessTokenTrustedIpsK8s"),
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityOidcAuth).as("accessTokenTrustedIpsOidc"),
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityTokenAuth).as("accessTokenTrustedIpsToken"),
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityJwtAuth).as("accessTokenTrustedIpsJwt"),
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityLdapAuth).as("accessTokenTrustedIpsLdap"),
          db.ref("name").withSchema(TableName.Identity)
        )
        .first();

      if (!doc) return;

      return {
        ...doc,
        trustedIpsUniversalAuth: doc.accessTokenTrustedIpsUa,
        trustedIpsGcpAuth: doc.accessTokenTrustedIpsGcp,
        trustedIpsAwsAuth: doc.accessTokenTrustedIpsAws,
        trustedIpsAzureAuth: doc.accessTokenTrustedIpsAzure,
        trustedIpsKubernetesAuth: doc.accessTokenTrustedIpsK8s,
        trustedIpsOidcAuth: doc.accessTokenTrustedIpsOidc,
        trustedIpsAccessTokenAuth: doc.accessTokenTrustedIpsToken,
        trustedIpsAccessJwtAuth: doc.accessTokenTrustedIpsJwt,
        trustedIpsAccessLdapAuth: doc.accessTokenTrustedIpsLdap
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "IdAccessTokenFindOne" });
    }
  };

  const removeExpiredTokens = async (tx?: Knex) => {
    logger.info(`${QueueName.DailyResourceCleanUp}: remove expired access token started`);

    const MAX_TTL = 315_360_000; // Maximum TTL value in seconds (10 years)

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
                    `"${TableName.IdentityAccessToken}"."accessTokenLastRenewedAt" + make_interval(secs => LEAST("${TableName.IdentityAccessToken}"."accessTokenTTL", ?)) < NOW()`,
                    [MAX_TTL]
                  );
              })
              .orWhere((qb3) => {
                void qb3
                  .whereNull("accessTokenLastRenewedAt")
                  // created + convert_integer_to_seconds(accessTokenTTL) < present_date
                  .andWhereRaw(
                    `"${TableName.IdentityAccessToken}"."createdAt" + make_interval(secs => LEAST("${TableName.IdentityAccessToken}"."accessTokenTTL", ?)) < NOW()`,
                    [MAX_TTL]
                  );
              });
          });
        })
        .delete();
      await docs;
      logger.info(`${QueueName.DailyResourceCleanUp}: remove expired access token completed`);
    } catch (error) {
      throw new DatabaseError({ error, name: "IdentityAccessTokenPrune" });
    }
  };

  return { ...identityAccessTokenOrm, findOne, removeExpiredTokens };
};
