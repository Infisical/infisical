import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TAgentVaultResolveDALFactory = ReturnType<typeof agentVaultResolveDALFactory>;

export type TResolveServiceRow = {
  id: string;
  name: string;
  accessBundleName: string;
  type: string;
  hostPattern: string;
  config: unknown;
  credentialType: string;
  credentialConfig: unknown;
  encryptedCredential: Buffer | null;
  allowedMethods: string[] | null;
  allowedPathPrefixes: string[] | null;
  memberProvidedFields: string[] | null;
  position: number;
};

export type TResolveSkillRow = {
  id: string;
  name: string;
  version: number;
  sha256: string;
  encryptedFiles: Buffer;
  accessBundleId: string;
  accessBundleName: string;
};

type TResolveScope = { sessionId: string; projectId: string; accessBundleIds: string[] | null };

export const agentVaultResolveDALFactory = (db: TDbClient) => {
  // The session's bundles that the actor can still reach: the bundle set fixed at mint, intersected with the bundles
  // the actor's live grants allow (accessBundleIds, null when every bundle in the project is allowed). Services and
  // skills both hang off this, so a lost grant takes both away together.
  const reachableSessionBundles = (conn: Knex, { sessionId, projectId, accessBundleIds }: TResolveScope) => {
    const query = conn(TableName.AgentVaultSessionAccessBundle)
      .where(`${TableName.AgentVaultSessionAccessBundle}.sessionId`, sessionId)
      .whereNotNull(`${TableName.AgentVaultSessionAccessBundle}.accessBundleId`)
      .join(
        TableName.AgentVaultAccessBundle,
        `${TableName.AgentVaultSessionAccessBundle}.accessBundleId`,
        `${TableName.AgentVaultAccessBundle}.id`
      )
      .where(`${TableName.AgentVaultAccessBundle}.projectId`, projectId);

    if (accessBundleIds) void query.whereIn(`${TableName.AgentVaultAccessBundle}.id`, accessBundleIds);
    return query;
  };

  /**
   * The hot path, and an intersection: a session's bundle set is a ceiling fixed at mint, re-checked against
   * live grants on every resolve, so losing a grant empties a running session without touching its row.
   *
   * Read on the replica, so replica lag adds to the one-poll-interval staleness promise.
   */
  const findResolvableServices = async (
    {
      serviceId,
      ...scope
    }: TResolveScope & {
      // Narrows to one service, for a credential refresh that must stay inside the session's resolved set.
      serviceId?: string;
    },
    tx?: Knex
  ): Promise<TResolveServiceRow[]> => {
    if (scope.accessBundleIds?.length === 0) return [];
    try {
      const query = reachableSessionBundles(tx || db.replicaNode(), scope).join(
        TableName.AgentVaultService,
        `${TableName.AgentVaultService}.accessBundleId`,
        `${TableName.AgentVaultAccessBundle}.id`
      );

      if (serviceId) void query.where(`${TableName.AgentVaultService}.id`, serviceId);

      return (await query
        .select(
          db.ref("id").withSchema(TableName.AgentVaultService),
          db.ref("name").withSchema(TableName.AgentVaultService),
          db.ref("type").withSchema(TableName.AgentVaultService),
          db.ref("hostPattern").withSchema(TableName.AgentVaultService),
          db.ref("config").withSchema(TableName.AgentVaultService),
          db.ref("credentialType").withSchema(TableName.AgentVaultService),
          db.ref("credentialConfig").withSchema(TableName.AgentVaultService),
          db.ref("encryptedCredential").withSchema(TableName.AgentVaultService),
          db.ref("allowedMethods").withSchema(TableName.AgentVaultService),
          db.ref("allowedPathPrefixes").withSchema(TableName.AgentVaultService),
          db.ref("memberProvidedFields").withSchema(TableName.AgentVaultService),
          // Resolve only reaches live bundles, so the current name is always the truthful one here.
          db.ref("name").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleName"),
          db.ref("position").withSchema(TableName.AgentVaultSessionAccessBundle)
        )
        .orderBy(`${TableName.AgentVaultSessionAccessBundle}.position`, "asc")
        .orderBy(`${TableName.AgentVaultService}.name`, "asc")) as TResolveServiceRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find resolvable agent vault services" });
    }
  };

  // The latest version of each skill, once, credited to the first of the session's bundles that carries it. Reads the
  // primary: this runs once per agent start, and a skill published a moment before must not arrive a version late.
  const findSessionSkills = async (scope: TResolveScope, tx?: Knex): Promise<TResolveSkillRow[]> => {
    if (scope.accessBundleIds?.length === 0) return [];
    try {
      const rows = (await reachableSessionBundles(tx || db, scope)
        .join(
          TableName.AgentVaultAccessBundleSkill,
          `${TableName.AgentVaultAccessBundleSkill}.accessBundleId`,
          `${TableName.AgentVaultAccessBundle}.id`
        )
        .join(
          TableName.AgentVaultSkill,
          `${TableName.AgentVaultAccessBundleSkill}.skillId`,
          `${TableName.AgentVaultSkill}.id`
        )
        .where(`${TableName.AgentVaultSkill}.projectId`, scope.projectId)
        .join(TableName.AgentVaultSkillVersion, function joinLatestVersion() {
          this.on(`${TableName.AgentVaultSkillVersion}.skillId`, `${TableName.AgentVaultSkill}.id`).andOn(
            `${TableName.AgentVaultSkillVersion}.version`,
            db.raw(`(SELECT MAX(v."version") FROM ?? v WHERE v."skillId" = ??.id)`, [
              TableName.AgentVaultSkillVersion,
              TableName.AgentVaultSkill
            ])
          );
        })
        .distinctOn(`${TableName.AgentVaultSkill}.id`)
        .select(
          db.ref("id").withSchema(TableName.AgentVaultSkill),
          db.ref("name").withSchema(TableName.AgentVaultSkill),
          db.ref("version").withSchema(TableName.AgentVaultSkillVersion),
          db.ref("sha256").withSchema(TableName.AgentVaultSkillVersion),
          db.ref("encryptedFiles").withSchema(TableName.AgentVaultSkillVersion),
          db.ref("id").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleId"),
          db.ref("name").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleName")
        )
        .orderBy([
          { column: `${TableName.AgentVaultSkill}.id` },
          { column: `${TableName.AgentVaultSessionAccessBundle}.position`, order: "asc" }
        ])) as TResolveSkillRow[];
      return rows.sort((a, b) => (a.name < b.name ? -1 : 1));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault session skills" });
    }
  };

  return { findResolvableServices, findSessionSkills };
};
