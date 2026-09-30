import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, IdentityAuthMethod, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { MAX_IDENTITY_ACCESS_TOKEN_TTL_SECONDS } from "@app/services/identity-access-token/identity-access-token-types";
import { MAX_UA_CLIENT_SECRET_TTL_SECONDS } from "@app/services/identity-ua/identity-ua-types";

export type TIdentityCredentialAlertDALFactory = ReturnType<typeof identityCredentialAlertDALFactory>;

export type TExpiringUaClientSecret = {
  id: string;
  description: string;
  clientSecretPrefix: string;
  identityId: string;
  identityName: string;
  expiresAt: Date;
};

export type TExpiringTokenAuthToken = {
  id: string;
  name: string | null;
  identityId: string;
  identityName: string;
  expiresAt: Date;
};

type TExpiringCredentialScanInput = {
  orgId: string;
  projectId?: string | null;
  identityId?: string | null;
  alertBeforeInterval: string;
  leadInterval: string;
  asOf: Date;
};

const scopeToVisibleIdentities = (
  query: Knex.QueryBuilder,
  identityIdColumn: string,
  { orgId, projectId, identityId }: Pick<TExpiringCredentialScanInput, "orgId" | "projectId" | "identityId">
) => {
  void query
    .join(TableName.Membership, identityIdColumn, `${TableName.Membership}.actorIdentityId`)
    .join(TableName.Identity, identityIdColumn, `${TableName.Identity}.id`)
    .where(`${TableName.Membership}.scope`, AccessScope.Organization)
    .where(`${TableName.Membership}.scopeOrgId`, orgId)
    .where(`${TableName.Identity}.orgId`, orgId);

  if (projectId) {
    void query
      .join({ projectMembership: TableName.Membership }, identityIdColumn, "projectMembership.actorIdentityId")
      .where("projectMembership.scope", AccessScope.Project)
      .where("projectMembership.scopeProjectId", projectId)
      .where(
        (bd) =>
          void bd.whereNull(`${TableName.Identity}.projectId`).orWhere(`${TableName.Identity}.projectId`, projectId)
      );
  } else {
    void query.whereNull(`${TableName.Identity}.projectId`);
  }

  if (identityId) {
    void query.where(identityIdColumn, identityId);
  }
};

export const identityCredentialAlertDALFactory = (db: TDbClient) => {
  const findExpiringUaClientSecrets = async (
    { alertBeforeInterval, leadInterval, asOf, ...scope }: TExpiringCredentialScanInput,
    tx?: Knex
  ): Promise<TExpiringUaClientSecret[]> => {
    try {
      // The clamp has to live in the expression, not in a `clientSecretTTL > 0` style guard to avoid overflow
      const expiresAtSql = `${TableName.IdentityUaClientSecret}."createdAt" + make_interval(secs => LEAST(GREATEST(${TableName.IdentityUaClientSecret}."clientSecretTTL", 0), ${MAX_UA_CLIENT_SECRET_TTL_SECONDS}))`;

      const query = (tx || db.replicaNode())(TableName.IdentityUaClientSecret)
        .join(
          TableName.IdentityUniversalAuth,
          `${TableName.IdentityUaClientSecret}.identityUAId`,
          `${TableName.IdentityUniversalAuth}.id`
        )
        .where(`${TableName.IdentityUaClientSecret}.isClientSecretRevoked`, false)
        .where(`${TableName.IdentityUaClientSecret}.clientSecretTTL`, ">", 0)
        .whereRaw(`${expiresAtSql} > ?::timestamptz`, [asOf])
        .whereRaw(`${expiresAtSql} <= ?::timestamptz + ?::interval + ?::interval`, [
          asOf,
          alertBeforeInterval,
          leadInterval
        ])
        .orderByRaw(`${expiresAtSql} asc`);

      scopeToVisibleIdentities(query, `${TableName.IdentityUniversalAuth}.identityId`, scope);

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

  const findExpiringTokenAuthTokens = async (
    { alertBeforeInterval, leadInterval, asOf, ...scope }: TExpiringCredentialScanInput,
    tx?: Knex
  ): Promise<TExpiringTokenAuthToken[]> => {
    try {
      const expiresAtSql = `${TableName.IdentityAccessToken}."createdAt" + make_interval(secs => LEAST(GREATEST(${TableName.IdentityAccessToken}."accessTokenTTL", 0), ${MAX_IDENTITY_ACCESS_TOKEN_TTL_SECONDS}))`;

      const query = (tx || db.replicaNode())(TableName.IdentityAccessToken)
        .where(`${TableName.IdentityAccessToken}.authMethod`, IdentityAuthMethod.TOKEN_AUTH)
        .where(`${TableName.IdentityAccessToken}.isAccessTokenRevoked`, false)
        .whereNotExists(
          (sub) =>
            void sub
              .select(db.raw("1"))
              .from(TableName.IdentityAccessTokenRevocation)
              .whereRaw("?? = ??::uuid", [
                `${TableName.IdentityAccessTokenRevocation}.id`,
                `${TableName.IdentityAccessToken}.id`
              ])
        )
        .where(`${TableName.IdentityAccessToken}.accessTokenTTL`, ">", 0)
        .whereRaw(`${expiresAtSql} > ?::timestamptz`, [asOf])
        .whereRaw(`${expiresAtSql} <= ?::timestamptz + ?::interval + ?::interval`, [
          asOf,
          alertBeforeInterval,
          leadInterval
        ])
        .orderByRaw(`${expiresAtSql} asc`);

      scopeToVisibleIdentities(query, `${TableName.IdentityAccessToken}.identityId`, scope);

      const rows = (await query.select(
        db.ref("id").withSchema(TableName.IdentityAccessToken),
        db.ref("name").withSchema(TableName.IdentityAccessToken),
        db.ref("identityId").withSchema(TableName.IdentityAccessToken),
        db.ref("name").withSchema(TableName.Identity).as("identityName"),
        db.raw(`${expiresAtSql} as "expiresAt"`)
      )) as TExpiringTokenAuthToken[];

      return rows;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindExpiringTokenAuthTokens" });
    }
  };

  const findIdentityInOrg = async (
    identityId: string,
    orgId: string,
    tx?: Knex
  ): Promise<{ orgId: string; projectId: string | null } | undefined> => {
    try {
      const row = (await (tx || db.replicaNode())(TableName.Membership)
        .join(TableName.Identity, `${TableName.Membership}.actorIdentityId`, `${TableName.Identity}.id`)
        .where(`${TableName.Membership}.actorIdentityId`, identityId)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .select(db.ref("orgId").withSchema(TableName.Identity), db.ref("projectId").withSchema(TableName.Identity))
        .first()) as { orgId: string; projectId: string | null } | undefined;
      return row;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindIdentityInOrg" });
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

  const findIdentitiesByIds = async (identityIds: string[], orgId: string): Promise<{ id: string; name: string }[]> => {
    if (identityIds.length === 0) return [];
    try {
      const rows = (await db(TableName.Identity).whereIn("id", identityIds).where({ orgId }).select("id", "name")) as {
        id: string;
        name: string;
      }[];
      return rows;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindIdentitiesByIds" });
    }
  };

  const findUserLabelById = async (userId: string): Promise<string | undefined> => {
    try {
      const row = (await db(TableName.Users).where({ id: userId }).select("email", "username").first()) as
        | { email: string | null; username: string }
        | undefined;
      return row ? (row.email ?? row.username) : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindUserLabelById" });
    }
  };

  return {
    findExpiringUaClientSecrets,
    findExpiringTokenAuthTokens,
    findIdentityInOrg,
    isIdentityInProject,
    getProjectType,
    findIdentitiesByIds,
    findUserLabelById
  };
};
