import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TIdentityCredentialAlarmDALFactory = ReturnType<typeof identityCredentialAlarmDALFactory>;

export type TExpiringUaClientSecret = {
  id: string;
  description: string;
  clientSecretPrefix: string;
  identityId: string;
  identityName: string;
  expiresAt: Date;
};

export const identityCredentialAlarmDALFactory = (db: TDbClient) => {
  const findExpiringUaClientSecrets = async (
    {
      orgId,
      projectId,
      identityId,
      alertBeforeInterval
    }: { orgId: string; projectId?: string | null; identityId?: string | null; alertBeforeInterval: string },
    tx?: Knex
  ): Promise<TExpiringUaClientSecret[]> => {
    try {
      const expiresAtSql = `${TableName.IdentityUaClientSecret}."createdAt" + (${TableName.IdentityUaClientSecret}."clientSecretTTL" * interval '1 second')`;

      const query = (tx || db.replicaNode())(TableName.IdentityUaClientSecret)
        .join(
          TableName.IdentityUniversalAuth,
          `${TableName.IdentityUaClientSecret}.identityUAId`,
          `${TableName.IdentityUniversalAuth}.id`
        )
        .join(
          TableName.IdentityOrgMembership,
          `${TableName.IdentityUniversalAuth}.identityId`,
          `${TableName.IdentityOrgMembership}.identityId`
        )
        .join(TableName.Identity, `${TableName.IdentityUniversalAuth}.identityId`, `${TableName.Identity}.id`)
        .where(`${TableName.IdentityOrgMembership}.orgId`, orgId)
        .where(`${TableName.IdentityUaClientSecret}.isClientSecretRevoked`, false)
        .where(`${TableName.IdentityUaClientSecret}.clientSecretTTL`, ">", 0)
        .whereRaw(`${expiresAtSql} > NOW()`)
        .whereRaw(`${expiresAtSql} <= NOW() + ?::interval`, [alertBeforeInterval]);

      if (projectId) {
        void query
          .join(
            TableName.IdentityProjectMembership,
            `${TableName.IdentityUniversalAuth}.identityId`,
            `${TableName.IdentityProjectMembership}.identityId`
          )
          .where(`${TableName.IdentityProjectMembership}.projectId`, projectId);
      }

      if (identityId) {
        void query.where(`${TableName.IdentityUniversalAuth}.identityId`, identityId);
      }

      const rows = (await query.select(
        db.ref("id").withSchema(TableName.IdentityUaClientSecret),
        db.ref("description").withSchema(TableName.IdentityUaClientSecret),
        db.ref("clientSecretPrefix").withSchema(TableName.IdentityUaClientSecret),
        db.ref("identityId").withSchema(TableName.IdentityUniversalAuth),
        db.ref("name").withSchema(TableName.Identity).as("identityName"),
        db.raw(`${expiresAtSql} as "expiresAt"`)
      )) as TExpiringUaClientSecret[];

      return rows;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindExpiringUaClientSecrets" });
    }
  };

  const isIdentityInOrg = async (identityId: string, orgId: string, tx?: Knex): Promise<boolean> => {
    try {
      const row = (await (tx || db.replicaNode())(TableName.IdentityOrgMembership)
        .where({ identityId, orgId })
        .first()) as { id: string } | undefined;
      return Boolean(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "IsIdentityInOrg" });
    }
  };

  const isIdentityInProject = async (identityId: string, projectId: string, tx?: Knex): Promise<boolean> => {
    try {
      const row = (await (tx || db.replicaNode())(TableName.IdentityProjectMembership)
        .where({ identityId, projectId })
        .first()) as { id: string } | undefined;
      return Boolean(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "IsIdentityInProject" });
    }
  };

  return { findExpiringUaClientSecrets, isIdentityInOrg, isIdentityInProject };
};
