import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { IdentityAuthMethod, TableName, TIdentityAccessTokens } from "@app/db/schemas";
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
        .leftJoin(TableName.IdentityUaClientSecret, (qb) => {
          qb.on(`${TableName.Identity}.authMethod`, db.raw("?", [IdentityAuthMethod.Univeral])).andOn(
            `${TableName.IdentityAccessToken}.identityUAClientSecretId`,
            `${TableName.IdentityUaClientSecret}.id`
          );
        })
        .leftJoin(TableName.IdentityUniversalAuth, (qb) => {
          qb.on(`${TableName.Identity}.authMethod`, db.raw("?", [IdentityAuthMethod.Univeral])).andOn(
            `${TableName.IdentityUaClientSecret}.identityUAId`,
            `${TableName.IdentityUniversalAuth}.id`
          );
        })
        .leftJoin(TableName.IdentityGcpAuth, (qb) => {
          qb.on(`${TableName.Identity}.authMethod`, db.raw("?", [IdentityAuthMethod.GCP_AUTH])).andOn(
            `${TableName.Identity}.id`,
            `${TableName.IdentityGcpAuth}.identityId`
          );
        })
        .leftJoin(TableName.IdentityAwsAuth, (qb) => {
          qb.on(`${TableName.Identity}.authMethod`, db.raw("?", [IdentityAuthMethod.AWS_AUTH])).andOn(
            `${TableName.Identity}.id`,
            `${TableName.IdentityAwsAuth}.identityId`
          );
        })
        .leftJoin(TableName.IdentityAzureAuth, (qb) => {
          qb.on(`${TableName.Identity}.authMethod`, db.raw("?", [IdentityAuthMethod.AZURE_AUTH])).andOn(
            `${TableName.Identity}.id`,
            `${TableName.IdentityAzureAuth}.identityId`
          );
        })
        .leftJoin(TableName.IdentityKubernetesAuth, (qb) => {
          qb.on(`${TableName.Identity}.authMethod`, db.raw("?", [IdentityAuthMethod.KUBERNETES_AUTH])).andOn(
            `${TableName.Identity}.id`,
            `${TableName.IdentityKubernetesAuth}.identityId`
          );
        })
        .leftJoin(TableName.IdentityOidcAuth, (qb) => {
          qb.on(`${TableName.Identity}.authMethod`, db.raw("?", [IdentityAuthMethod.OIDC_AUTH])).andOn(
            `${TableName.Identity}.id`,
            `${TableName.IdentityOidcAuth}.identityId`
          );
        })
        .leftJoin(TableName.IdentityTokenAuth, (qb) => {
          qb.on(`${TableName.Identity}.authMethod`, db.raw("?", [IdentityAuthMethod.TOKEN_AUTH])).andOn(
            `${TableName.Identity}.id`,
            `${TableName.IdentityTokenAuth}.identityId`
          );
        })
        .select(selectAllTableCols(TableName.IdentityAccessToken))
        .select(
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityUniversalAuth).as("accessTokenTrustedIpsUa"),
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityGcpAuth).as("accessTokenTrustedIpsGcp"),
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityAwsAuth).as("accessTokenTrustedIpsAws"),
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityAzureAuth).as("accessTokenTrustedIpsAzure"),
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityKubernetesAuth).as("accessTokenTrustedIpsK8s"),
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityOidcAuth).as("accessTokenTrustedIpsOidc"),
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityTokenAuth).as("accessTokenTrustedIpsToken"),
          db.ref("name").withSchema(TableName.Identity)
        )
        .first();

      if (!doc) return;

      return {
        ...doc,
        accessTokenTrustedIps:
          doc.accessTokenTrustedIpsUa ||
          doc.accessTokenTrustedIpsGcp ||
          doc.accessTokenTrustedIpsAws ||
          doc.accessTokenTrustedIpsAzure ||
          doc.accessTokenTrustedIpsK8s ||
          doc.accessTokenTrustedIpsOidc ||
          doc.accessTokenTrustedIpsToken
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "IdAccessTokenFindOne" });
    }
  };

  const removeExpiredTokens = async (tx?: Knex) => {
    logger.info(`${QueueName.DailyResourceCleanUp}: remove expired access token started`);
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
      await docs;
      logger.info(`${QueueName.DailyResourceCleanUp}: remove expired access token completed`);
    } catch (error) {
      throw new DatabaseError({ error, name: "IdentityAccessTokenPrune" });
    }
  };

  return { ...identityAccessTokenOrm, findOne, removeExpiredTokens };
};
