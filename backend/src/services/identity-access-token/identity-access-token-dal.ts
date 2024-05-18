import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { IdentityAuthMethod, TableName, TIdentityAccessTokens } from "@app/db/schemas";
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
        .leftJoin(TableName.IdentityKubernetesAuth, (qb) => {
          qb.on(`${TableName.Identity}.authMethod`, db.raw("?", [IdentityAuthMethod.KUBERNETES_AUTH])).andOn(
            `${TableName.Identity}.id`,
            `${TableName.IdentityKubernetesAuth}.identityId`
          );
        })
        .select(selectAllTableCols(TableName.IdentityAccessToken))
        .select(
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityUniversalAuth).as("accessTokenTrustedIpsUa"),
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityGcpAuth).as("accessTokenTrustedIpsGcp"),
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityAwsAuth).as("accessTokenTrustedIpsAws"),
          db.ref("accessTokenTrustedIps").withSchema(TableName.IdentityKubernetesAuth).as("accessTokenTrustedIpsK8s"),
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
          doc.accessTokenTrustedIpsK8s
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "IdAccessTokenFindOne" });
    }
  };

  return { ...identityAccessTokenOrm, findOne };
};
