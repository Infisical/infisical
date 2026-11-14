import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TAgentVaultResolveDALFactory = ReturnType<typeof agentVaultResolveDALFactory>;

export type TResolveServiceRow = {
  id: string;
  name: string;
  description: string | null;
  // Null for a service the session names itself rather than reaching through its bundle.
  accessBundleId: string | null;
  accessBundleName: string | null;
  type: string;
  hostPattern: string | null;
  config: unknown;
  credentialType: string;
  credentialConfig: unknown;
  encryptedCredential: Buffer | null;
  allowedMethods: string[] | null;
  allowedPathPrefixes: string[] | null;
  allowedTools: string[] | null;
  memberProvidedFields: string[] | null;
  hookUrl: string | null;
  encryptedHookSecret: Buffer | null;
  position: number;
};

export type TResolveSkillRow = {
  id: string;
  name: string;
  version: number;
  sha256: string;
  encryptedFiles: Buffer;
  // Null for a skill the session names itself rather than reaching through its bundle.
  accessBundleId: string | null;
  accessBundleName: string | null;
};

type TResolveScope = { sessionId: string; projectId: string; accessBundleIds: string[] | null };

// A session found only on the primary is newer than the replica, and so are the bundle links written with it.
type TResolveReadOptions = { onPrimary?: boolean };

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

  const SERVICE_COLUMNS = [
    "id",
    "name",
    "description",
    "type",
    "hostPattern",
    "config",
    "credentialType",
    "credentialConfig",
    "encryptedCredential",
    "allowedMethods",
    "allowedPathPrefixes",
    "allowedTools",
    "memberProvidedFields",
    "hookUrl",
    "encryptedHookSecret"
  ] as const;

  /**
   * The hot path, and an intersection: the services a session reaches through its bundle and the ones it names are a
   * ceiling fixed at mint, re-checked against live grants on every resolve, so losing a grant empties a running session
   * without touching its rows. A named service stays only while the owner reaches it through a bundle they are granted
   * (any of them when accessBundleIds is null). Services through the bundle come first, then the named ones.
   *
   * Read on the replica unless onPrimary, so replica lag adds to the one-poll-interval staleness promise.
   */
  const findResolvableServices = async (
    {
      serviceId,
      onPrimary,
      ...scope
    }: TResolveScope &
      TResolveReadOptions & {
        // Narrows to one service, for a credential refresh that must stay inside the session's resolved set.
        serviceId?: string;
      },
    tx?: Knex
  ): Promise<TResolveServiceRow[]> => {
    if (scope.accessBundleIds?.length === 0) return [];
    try {
      const conn = tx || (onPrimary ? db : db.replicaNode());
      const serviceColumns = SERVICE_COLUMNS.map((column) => db.ref(column).withSchema(TableName.AgentVaultService));

      const throughBundleQuery = reachableSessionBundles(conn, scope)
        .join(
          TableName.AgentVaultAccessBundleService,
          `${TableName.AgentVaultAccessBundleService}.accessBundleId`,
          `${TableName.AgentVaultAccessBundle}.id`
        )
        .join(
          TableName.AgentVaultService,
          `${TableName.AgentVaultService}.id`,
          `${TableName.AgentVaultAccessBundleService}.serviceId`
        )
        .whereNull(`${TableName.AgentVaultService}.sessionId`);
      if (serviceId) void throughBundleQuery.where(`${TableName.AgentVaultService}.id`, serviceId);
      const throughBundle = (await throughBundleQuery
        .select(
          ...serviceColumns,
          db.ref("id").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleId"),
          // Resolve only reaches live bundles, so the current name is always the truthful one here.
          db.ref("name").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleName"),
          db.ref("position").withSchema(TableName.AgentVaultSessionAccessBundle)
        )
        .orderBy(`${TableName.AgentVaultSessionAccessBundle}.position`, "asc")
        .orderBy(`${TableName.AgentVaultService}.name`, "asc")) as TResolveServiceRow[];

      const namedQuery = conn(TableName.AgentVaultSessionService)
        .where(`${TableName.AgentVaultSessionService}.sessionId`, scope.sessionId)
        .join(
          TableName.AgentVaultService,
          `${TableName.AgentVaultService}.id`,
          `${TableName.AgentVaultSessionService}.serviceId`
        )
        .where(`${TableName.AgentVaultService}.projectId`, scope.projectId)
        .whereNull(`${TableName.AgentVaultService}.sessionId`);
      if (scope.accessBundleIds) {
        void namedQuery.whereExists(
          conn(TableName.AgentVaultAccessBundleService)
            .whereRaw("??.?? = ??.??", [
              TableName.AgentVaultAccessBundleService,
              "serviceId",
              TableName.AgentVaultService,
              "id"
            ])
            .whereIn(`${TableName.AgentVaultAccessBundleService}.accessBundleId`, scope.accessBundleIds)
            .select(db.raw("1"))
        );
      }
      if (serviceId) void namedQuery.where(`${TableName.AgentVaultService}.id`, serviceId);
      const named = (await namedQuery
        .select(
          ...serviceColumns,
          db.raw("NULL::uuid AS ??", ["accessBundleId"]),
          db.raw("NULL::text AS ??", ["accessBundleName"]),
          db.ref("position").withSchema(TableName.AgentVaultSessionService)
        )
        .orderBy(`${TableName.AgentVaultSessionService}.position`, "asc")) as unknown as TResolveServiceRow[];

      // A service the session names that its bundle also holds is sent once, as the bundle's.
      const throughBundleIds = new Set(throughBundle.map((row) => row.id));
      return [...throughBundle, ...named.filter((row) => !throughBundleIds.has(row.id))];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find resolvable agent vault services" });
    }
  };

  /**
   * The latest version of each skill the session reaches through its bundle or names, once. Like the services, both are
   * a ceiling fixed at mint and re-checked against live grants: a named skill stays only while a bundle the owner
   * reaches holds it (any of them when accessBundleIds is null). A skill through the bundle is credited to the first of
   * the session's bundles that carries it, and one the bundle also holds is sent once, as the bundle's. Reads the
   * primary: this runs once per agent start, and a skill published a moment before must not arrive a version late.
   */
  const findSessionSkills = async (scope: TResolveScope, tx?: Knex): Promise<TResolveSkillRow[]> => {
    if (scope.accessBundleIds?.length === 0) return [];
    try {
      const conn = tx || db;
      const latestVersion = function joinLatestVersion(this: Knex.JoinClause) {
        this.on(`${TableName.AgentVaultSkillVersion}.skillId`, `${TableName.AgentVaultSkill}.id`).andOn(
          `${TableName.AgentVaultSkillVersion}.version`,
          db.raw(`(SELECT MAX(v."version") FROM ?? v WHERE v."skillId" = ??.id)`, [
            TableName.AgentVaultSkillVersion,
            TableName.AgentVaultSkill
          ])
        );
      };
      const skillColumns = [
        db.ref("id").withSchema(TableName.AgentVaultSkill),
        db.ref("name").withSchema(TableName.AgentVaultSkill),
        db.ref("version").withSchema(TableName.AgentVaultSkillVersion),
        db.ref("sha256").withSchema(TableName.AgentVaultSkillVersion),
        db.ref("encryptedFiles").withSchema(TableName.AgentVaultSkillVersion)
      ];

      const throughBundle = (await reachableSessionBundles(conn, scope)
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
        .whereNull(`${TableName.AgentVaultSkill}.sessionId`)
        .join(TableName.AgentVaultSkillVersion, latestVersion)
        .distinctOn(`${TableName.AgentVaultSkill}.id`)
        .select(
          ...skillColumns,
          db.ref("id").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleId"),
          db.ref("name").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleName")
        )
        .orderBy([
          { column: `${TableName.AgentVaultSkill}.id` },
          { column: `${TableName.AgentVaultSessionAccessBundle}.position`, order: "asc" }
        ])) as TResolveSkillRow[];

      const namedQuery = conn(TableName.AgentVaultSessionSkill)
        .where(`${TableName.AgentVaultSessionSkill}.sessionId`, scope.sessionId)
        .join(
          TableName.AgentVaultSkill,
          `${TableName.AgentVaultSkill}.id`,
          `${TableName.AgentVaultSessionSkill}.skillId`
        )
        .where(`${TableName.AgentVaultSkill}.projectId`, scope.projectId)
        .whereNull(`${TableName.AgentVaultSkill}.sessionId`)
        .join(TableName.AgentVaultSkillVersion, latestVersion);
      if (scope.accessBundleIds) {
        void namedQuery.whereExists(
          conn(TableName.AgentVaultAccessBundleSkill)
            .whereRaw("??.?? = ??.??", [
              TableName.AgentVaultAccessBundleSkill,
              "skillId",
              TableName.AgentVaultSkill,
              "id"
            ])
            .whereIn(`${TableName.AgentVaultAccessBundleSkill}.accessBundleId`, scope.accessBundleIds)
            .select(db.raw("1"))
        );
      }
      const named = (await namedQuery.select(
        ...skillColumns,
        db.raw("NULL::uuid AS ??", ["accessBundleId"]),
        db.raw("NULL::text AS ??", ["accessBundleName"])
      )) as unknown as TResolveSkillRow[];

      const throughBundleIds = new Set(throughBundle.map((row) => row.id));
      return [...throughBundle, ...named.filter((row) => !throughBundleIds.has(row.id))].sort((a, b) =>
        a.name < b.name ? -1 : 1
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault session skills" });
    }
  };

  // The session's bundles the actor can still reach, in the order they were minted with, whether or not they hold a
  // service.
  const findReachableBundles = async (
    { onPrimary, ...scope }: TResolveScope & TResolveReadOptions,
    tx?: Knex
  ): Promise<{ id: string; name: string }[]> => {
    if (scope.accessBundleIds?.length === 0) return [];
    try {
      return (await reachableSessionBundles(tx || (onPrimary ? db : db.replicaNode()), scope)
        .select(
          db.ref("id").withSchema(TableName.AgentVaultAccessBundle),
          db.ref("name").withSchema(TableName.AgentVaultAccessBundle)
        )
        .orderBy(`${TableName.AgentVaultSessionAccessBundle}.position`, "asc")) as { id: string; name: string }[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find reachable agent vault session bundles" });
    }
  };

  return { findResolvableServices, findSessionSkills, findReachableBundles };
};
