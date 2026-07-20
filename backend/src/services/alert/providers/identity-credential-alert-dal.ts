import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TIdentityCredentialAlertDALFactory = ReturnType<typeof identityCredentialAlertDALFactory>;

export type TExpiringUaClientSecret = {
  id: string;
  description: string;
  clientSecretPrefix: string;
  identityId: string;
  identityName: string;
  expiresAt: Date;
};

export const identityCredentialAlertDALFactory = (db: TDbClient) => {
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
          TableName.Membership,
          `${TableName.IdentityUniversalAuth}.identityId`,
          `${TableName.Membership}.actorIdentityId`
        )
        .join(TableName.Identity, `${TableName.IdentityUniversalAuth}.identityId`, `${TableName.Identity}.id`)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .where(`${TableName.IdentityUaClientSecret}.isClientSecretRevoked`, false)
        .where(`${TableName.IdentityUaClientSecret}.clientSecretTTL`, ">", 0)
        .whereRaw(`${expiresAtSql} > NOW()`)
        .whereRaw(`${expiresAtSql} <= NOW() + ?::interval`, [alertBeforeInterval]);

      if (projectId) {
        void query
          .join(
            { projectMembership: TableName.Membership },
            `${TableName.IdentityUniversalAuth}.identityId`,
            "projectMembership.actorIdentityId"
          )
          .where("projectMembership.scope", AccessScope.Project)
          .where("projectMembership.scopeProjectId", projectId);
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
      const row = (await (tx || db.replicaNode())(TableName.Membership)
        .where({ actorIdentityId: identityId, scopeOrgId: orgId, scope: AccessScope.Organization })
        .first()) as { id: string } | undefined;
      return Boolean(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "IsIdentityInOrg" });
    }
  };

  const isIdentityInProject = async (identityId: string, projectId: string, tx?: Knex): Promise<boolean> => {
    try {
      const row = (await (tx || db.replicaNode())(TableName.Membership)
        .where({ actorIdentityId: identityId, scopeProjectId: projectId, scope: AccessScope.Project })
        .first()) as { id: string } | undefined;
      return Boolean(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "IsIdentityInProject" });
    }
  };

  const getProjectType = async (projectId: string, tx?: Knex): Promise<string | null> => {
    try {
      const row = (await (tx || db.replicaNode())(TableName.Project)
        .where({ id: projectId })
        .select("type")
        .first()) as { type: string } | undefined;
      return row?.type ?? null;
    } catch (error) {
      throw new DatabaseError({ error, name: "GetProjectType" });
    }
  };

  return { findExpiringUaClientSecrets, isIdentityInOrg, isIdentityInProject, getProjectType };
};
