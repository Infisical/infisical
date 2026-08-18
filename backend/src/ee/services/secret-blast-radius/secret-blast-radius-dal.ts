import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TSecretBlastRadiusDALFactory = ReturnType<typeof secretBlastRadiusDALFactory>;

export type TRankingCandidate = {
  secretId: string;
  key: string;
  version: number;
  updatedAt: Date;
  folderId: string;
  envId: string;
  envSlug: string;
  envName: string;
  syncCount: number;
  versionCreatedAt: Date | null;
};

export const secretBlastRadiusDALFactory = (db: TDbClient) => {
  // The moment the current value came into being. `secrets_v2.updatedAt` also moves for metadata-only
  // edits, so it cannot answer "how old is this value".
  const findCurrentVersionCreatedAt = async (secretId: string, version: number, tx?: Knex) => {
    try {
      const row = await (tx || db.replicaNode())(TableName.SecretVersionV2)
        .where({ secretId, version })
        .select("createdAt")
        .first();

      return row?.createdAt ?? null;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindCurrentVersionCreatedAt" });
    }
  };

  const findSyncsByFolderId = async (folderId: string, tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.SecretSync)
        .where(`${TableName.SecretSync}.folderId`, folderId)
        .select(
          db.ref("id").withSchema(TableName.SecretSync),
          db.ref("name").withSchema(TableName.SecretSync),
          db.ref("destination").withSchema(TableName.SecretSync),
          db.ref("destinationConfig").withSchema(TableName.SecretSync),
          db.ref("syncOptions").withSchema(TableName.SecretSync),
          db.ref("syncStatus").withSchema(TableName.SecretSync),
          db.ref("lastSyncMessage").withSchema(TableName.SecretSync),
          db.ref("lastSyncedAt").withSchema(TableName.SecretSync),
          db.ref("isAutoSyncEnabled").withSchema(TableName.SecretSync)
        );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSyncsByFolderId" });
    }
  };

  // Folders that pull this path in. Each one is a second home for the value, and it carries its own
  // syncs, which is how a prod secret quietly reaches a staging destination.
  const findImportsOfPath = async (envId: string, secretPath: string, tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.SecretImport)
        .where(`${TableName.SecretImport}.importEnv`, envId)
        .where(`${TableName.SecretImport}.importPath`, secretPath)
        .join(TableName.SecretFolder, `${TableName.SecretImport}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .select(
          db.ref("id").withSchema(TableName.SecretImport),
          db.ref("isReplication").withSchema(TableName.SecretImport),
          db.ref("isReplicationSuccess").withSchema(TableName.SecretImport),
          db.ref("lastReplicated").withSchema(TableName.SecretImport),
          db.ref("id").withSchema(TableName.SecretFolder).as("importingFolderId"),
          db.ref("slug").withSchema(TableName.Environment).as("importingEnvSlug"),
          db.ref("name").withSchema(TableName.Environment).as("importingEnvName"),
          db.ref("projectId").withSchema(TableName.Environment).as("importingProjectId")
        );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindImportsOfPath" });
    }
  };

  // Secrets whose value interpolates this one. This is the reverse of the reference tree the secret
  // dashboard already draws: that one walks dependencies, blast radius needs dependents.
  const findReferencingSecrets = async (
    { environment, secretPath, secretKey }: { environment: string; secretPath: string; secretKey: string },
    tx?: Knex
  ) => {
    try {
      return await (tx || db.replicaNode())(TableName.SecretReferenceV2)
        .where(`${TableName.SecretReferenceV2}.environment`, environment)
        .where(`${TableName.SecretReferenceV2}.secretPath`, secretPath)
        .where(`${TableName.SecretReferenceV2}.secretKey`, secretKey)
        .join(TableName.SecretV2, `${TableName.SecretReferenceV2}.secretId`, `${TableName.SecretV2}.id`)
        .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .select(
          db.ref("id").withSchema(TableName.SecretReferenceV2),
          db.ref("targetProjectSlug").withSchema(TableName.SecretReferenceV2),
          db.ref("id").withSchema(TableName.SecretV2).as("referencingSecretId"),
          db.ref("key").withSchema(TableName.SecretV2).as("referencingSecretKey"),
          db.ref("folderId").withSchema(TableName.SecretV2).as("referencingFolderId"),
          db.ref("slug").withSchema(TableName.Environment).as("referencingEnvSlug"),
          db.ref("projectId").withSchema(TableName.Environment).as("referencingProjectId")
        );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindReferencingSecrets" });
    }
  };

  const findRotationBySecretId = async (secretId: string, tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.SecretRotationV2SecretMapping)
        .where(`${TableName.SecretRotationV2SecretMapping}.secretId`, secretId)
        .join(
          TableName.SecretRotationV2,
          `${TableName.SecretRotationV2SecretMapping}.rotationId`,
          `${TableName.SecretRotationV2}.id`
        )
        .select(
          db.ref("id").withSchema(TableName.SecretRotationV2),
          db.ref("name").withSchema(TableName.SecretRotationV2),
          db.ref("rotationInterval").withSchema(TableName.SecretRotationV2),
          db.ref("rotationStatus").withSchema(TableName.SecretRotationV2),
          db.ref("isAutoRotationEnabled").withSchema(TableName.SecretRotationV2),
          db.ref("lastRotatedAt").withSchema(TableName.SecretRotationV2),
          db.ref("nextRotationAt").withSchema(TableName.SecretRotationV2)
        )
        .first();
    } catch (error) {
      throw new DatabaseError({ error, name: "FindRotationBySecretId" });
    }
  };

  // A folder shared into another project: every principal over there reaches this value through
  // permissions this project cannot see.
  const findFolderGrants = async (sourceFolderId: string, tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.ProjectFolderGrant)
        .where(`${TableName.ProjectFolderGrant}.sourceFolderId`, sourceFolderId)
        .join(TableName.Project, `${TableName.ProjectFolderGrant}.targetProjectId`, `${TableName.Project}.id`)
        .select(
          db.ref("id").withSchema(TableName.ProjectFolderGrant),
          db.ref("targetProjectId").withSchema(TableName.ProjectFolderGrant),
          db.ref("name").withSchema(TableName.Project).as("targetProjectName")
        );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindFolderGrants" });
    }
  };

  const findApprovalPoliciesByEnv = async (envId: string, tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.SecretApprovalPolicy)
        .where(`${TableName.SecretApprovalPolicy}.envId`, envId)
        .whereNull(`${TableName.SecretApprovalPolicy}.deletedAt`)
        .select(
          db.ref("id").withSchema(TableName.SecretApprovalPolicy),
          db.ref("name").withSchema(TableName.SecretApprovalPolicy),
          db.ref("secretPath").withSchema(TableName.SecretApprovalPolicy),
          db.ref("enforcementLevel").withSchema(TableName.SecretApprovalPolicy)
        );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindApprovalPoliciesByEnv" });
    }
  };

  // Ghost readers are resolved from denormalized audit-log metadata, so the principal may be long
  // gone. This separates "still in the org, access revoked" from "deleted outright".
  const findExistingPrincipals = async (
    { userIds, identityIds }: { userIds: string[]; identityIds: string[] },
    tx?: Knex
  ) => {
    try {
      const conn = tx || db.replicaNode();
      const [users, identities] = await Promise.all([
        userIds.length
          ? conn(TableName.Users).whereIn("id", userIds).select("id", "username", "email")
          : Promise.resolve([] as { id: string; username: string; email?: string | null }[]),
        identityIds.length
          ? conn(TableName.Identity).whereIn("id", identityIds).select("id", "name")
          : Promise.resolve([] as { id: string; name: string }[])
      ]);

      return { users, identities };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindExistingPrincipals" });
    }
  };

  // Names for the members of a group, capped per group: a graph does not need 400 names to draw a node,
  // and the exact size travels separately as a count.
  const findGroupMembers = async (groupIds: string[], limitPerGroup: number, tx?: Knex) => {
    if (!groupIds.length) return [];

    try {
      const conn = tx || db.replicaNode();
      const [users, identities] = await Promise.all([
        conn(TableName.UserGroupMembership)
          .whereIn(`${TableName.UserGroupMembership}.groupId`, groupIds)
          .join(TableName.Users, `${TableName.UserGroupMembership}.userId`, `${TableName.Users}.id`)
          .select(
            db.ref("groupId").withSchema(TableName.UserGroupMembership),
            db.ref("id").withSchema(TableName.Users),
            db.ref("username").withSchema(TableName.Users).as("name")
          ),
        conn(TableName.IdentityGroupMembership)
          .whereIn(`${TableName.IdentityGroupMembership}.groupId`, groupIds)
          .join(TableName.Identity, `${TableName.IdentityGroupMembership}.identityId`, `${TableName.Identity}.id`)
          .select(
            db.ref("groupId").withSchema(TableName.IdentityGroupMembership),
            db.ref("id").withSchema(TableName.Identity),
            db.ref("name").withSchema(TableName.Identity)
          )
      ]);

      const perGroup = new Map<string, number>();
      return [
        ...users.map((row) => ({ ...row, isUser: true })),
        ...identities.map((row) => ({ ...row, isUser: false }))
      ].filter((row) => {
        const seen = perGroup.get(row.groupId) ?? 0;
        if (seen >= limitPerGroup) return false;
        perGroup.set(row.groupId, seen + 1);
        return true;
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "FindGroupMembers" });
    }
  };

  /**
   * Candidates for the exposure ranking, cheaply prefiltered in SQL before the real score is computed.
   *
   * Scoring every secret in a project would mean an audit-log aggregate per secret, so the ranking picks
   * the secrets most likely to score high (widest distribution, oldest value) and scores only those. The
   * cost is that a secret with no syncs and a fresh value cannot appear, which is exactly the secret that
   * would not have ranked anyway.
   */
  const findRankingCandidates = async (
    { projectId, environment, limit }: { projectId: string; environment?: string; limit: number },
    tx?: Knex
  ) => {
    try {
      const conn = tx || db.replicaNode();
      const query = conn(TableName.SecretV2)
        .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where(`${TableName.Environment}.projectId`, projectId)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .whereNull(`${TableName.SecretV2}.userId`)
        .select(
          db.ref("id").withSchema(TableName.SecretV2).as("secretId"),
          db.ref("key").withSchema(TableName.SecretV2),
          db.ref("version").withSchema(TableName.SecretV2),
          db.ref("updatedAt").withSchema(TableName.SecretV2),
          db.ref("folderId").withSchema(TableName.SecretV2),
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName"),
          db.raw(`(SELECT COUNT(*) FROM ?? WHERE ??.?? = ??.??)::int as "syncCount"`, [
            TableName.SecretSync,
            TableName.SecretSync,
            "folderId",
            TableName.SecretV2,
            "folderId"
          ]),
          db.raw(
            `(SELECT MAX(??."createdAt") FROM ?? WHERE ??."secretId" = ??.?? AND ??.version = ??.version) as "versionCreatedAt"`,
            [
              TableName.SecretVersionV2,
              TableName.SecretVersionV2,
              TableName.SecretVersionV2,
              TableName.SecretV2,
              "id",
              TableName.SecretVersionV2,
              TableName.SecretV2
            ]
          )
        )
        // A select alias is only visible to ORDER BY as a bare name, never inside an expression, so the
        // age expression is repeated here rather than referring to "versionCreatedAt".
        .orderByRaw(
          `"syncCount" DESC, COALESCE((SELECT MAX(??."createdAt") FROM ?? WHERE ??."secretId" = ??.?? AND ??.version = ??.version), ??."updatedAt") ASC`,
          [
            TableName.SecretVersionV2,
            TableName.SecretVersionV2,
            TableName.SecretVersionV2,
            TableName.SecretV2,
            "id",
            TableName.SecretVersionV2,
            TableName.SecretV2,
            TableName.SecretV2
          ]
        )
        .limit(limit);

      if (environment) {
        void query.where(`${TableName.Environment}.slug`, environment);
      }

      return (await query) as unknown as TRankingCandidate[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindRankingCandidates" });
    }
  };

  return {
    findCurrentVersionCreatedAt,
    findGroupMembers,
    findRankingCandidates,
    findSyncsByFolderId,
    findImportsOfPath,
    findReferencingSecrets,
    findRotationBySecretId,
    findFolderGrants,
    findApprovalPoliciesByEnv,
    findExistingPrincipals
  };
};
