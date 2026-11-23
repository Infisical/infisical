import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import {
  AgentVaultPatternRelation,
  parseHostPatterns,
  relateHostPatterns,
  TAgentVaultHostPattern
} from "../agent-vault/agent-vault-host-pattern-fns";

export type TAgentVaultResolveDALFactory = ReturnType<typeof agentVaultResolveDALFactory>;

export type TResolveServiceRow = {
  id: string;
  name: string;
  description: string | null;
  // Null for a service the session lists itself rather than reaching through its bundle. An override carries the bundle
  // that pairs it with the listed service.
  accessBundleId: string | null;
  accessBundleName: string | null;
  // A service the session gets only because a bundle that gives the owner one of its listed services uses it for some of
  // that service's hosts.
  isOverride?: boolean;
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
  // Null for a skill the session lists itself rather than reaching through its bundle.
  accessBundleId: string | null;
  accessBundleName: string | null;
};

// What the session's owner reaches now (see TAgentVaultReach): the bundles they can use, and the services and skills
// they can use directly. Each is null when it covers every one in the project.
type TResolveScope = {
  sessionId: string;
  projectId: string;
  accessBundleIds: string[] | null;
  serviceIds: string[] | null;
  skillIds: string[] | null;
};

// A listed service or skill stays while the owner can use it directly or through a bundle that holds it.
const whereUsable = (
  conn: Knex,
  query: Knex.QueryBuilder,
  {
    table,
    linkTable,
    linkColumn,
    directIds,
    accessBundleIds
  }: {
    table: TableName;
    linkTable: TableName;
    linkColumn: string;
    directIds: string[] | null;
    accessBundleIds: string[] | null;
  }
) => {
  if (directIds === null) return;
  void query.where((qb) => {
    if (directIds.length) void qb.whereIn(`${table}.id`, directIds);
    void qb.orWhereExists(
      conn(linkTable)
        .whereRaw("??.?? = ??.??", [linkTable, linkColumn, table, "id"])
        .modify((link) => {
          if (accessBundleIds) void link.whereIn(`${linkTable}.accessBundleId`, accessBundleIds);
        })
        .select(conn.raw("1"))
    );
  });
};

// A session found only on the primary is newer than the replica, and so are the bundle links written with it.
type TResolveReadOptions = { onPrimary?: boolean };

export const agentVaultResolveDALFactory = (db: TDbClient) => {
  // The session's bundles that the actor can still use: the bundle set fixed at mint, intersected with the bundles the
  // actor's roles let them use now (accessBundleIds, null when every bundle in the project is allowed). Services and
  // skills both hang off this, so losing the bundle takes both away together.
  const reachableSessionBundles = (
    conn: Knex,
    { sessionId, projectId, accessBundleIds }: Pick<TResolveScope, "sessionId" | "projectId" | "accessBundleIds">
  ) => {
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

  const wildcardsOf = ({ hostPattern }: { hostPattern: string | null }) =>
    hostPattern ? parseHostPatterns(hostPattern).patterns.filter((pattern) => pattern.isWildcard) : [];

  const coversExactHostOf = (wildcards: TAgentVaultHostPattern[], { hostPattern }: { hostPattern: string | null }) =>
    Boolean(hostPattern) &&
    parseHostPatterns(hostPattern!).patterns.some(
      (pattern) =>
        !pattern.isWildcard &&
        wildcards.some((wildcard) => relateHostPatterns(wildcard, pattern) === AgentVaultPatternRelation.Contained)
    );

  /**
   * An exact host beats a wildcard, which is how a bundle writes an override: `api.example.com` read-only beside an
   * unrestricted `*.example.com`. A session that names only the wildcard service would take that host with the
   * wildcard's credential and rules, so it also gets each service that a bundle giving the owner a listed service uses for
   * one of its hosts, and those services' overrides in turn, the way a session carrying that bundle would.
   */
  const findOverridesOfServices = async (
    conn: Knex,
    { projectId, accessBundleIds }: { projectId: string; accessBundleIds: string[] | null },
    listedServices: Pick<TResolveServiceRow, "id" | "hostPattern" | "position">[],
    presentIds: Set<string>
  ): Promise<TResolveServiceRow[]> => {
    const roots = listedServices.filter((row) => wildcardsOf(row).length);
    if (!roots.length) return [];

    const rows = (await conn(TableName.AgentVaultAccessBundleService)
      .join(
        TableName.AgentVaultAccessBundle,
        `${TableName.AgentVaultAccessBundle}.id`,
        `${TableName.AgentVaultAccessBundleService}.accessBundleId`
      )
      .join(
        TableName.AgentVaultService,
        `${TableName.AgentVaultService}.id`,
        `${TableName.AgentVaultAccessBundleService}.serviceId`
      )
      .where(`${TableName.AgentVaultAccessBundle}.projectId`, projectId)
      .modify((query) => {
        if (accessBundleIds) void query.whereIn(`${TableName.AgentVaultAccessBundle}.id`, accessBundleIds);
      })
      .whereIn(
        `${TableName.AgentVaultAccessBundle}.id`,
        conn({ holder: TableName.AgentVaultAccessBundleService })
          .whereIn(
            "holder.serviceId",
            roots.map((row) => row.id)
          )
          .select("holder.accessBundleId")
      )
      .whereNull(`${TableName.AgentVaultService}.sessionId`)
      .whereNotNull(`${TableName.AgentVaultService}.hostPattern`)
      .select(
        ...SERVICE_COLUMNS.map((column) => db.ref(column).withSchema(TableName.AgentVaultService)),
        db.ref("id").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleId"),
        db.ref("name").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleName")
      )
      .orderBy(`${TableName.AgentVaultAccessBundle}.name`, "asc")
      .orderBy(`${TableName.AgentVaultService}.name`, "asc")) as Omit<TResolveServiceRow, "position">[];

    const rootById = new Map(roots.map((row) => [row.id, row]));
    const byBundle = new Map<string, typeof rows>();
    rows.forEach((row) => byBundle.set(row.accessBundleId!, [...(byBundle.get(row.accessBundleId!) ?? []), row]));

    // Bundles in name order, so a service two of them pair with a listed service is credited to the same one each time.
    const overrides = new Map<string, TResolveServiceRow>();
    byBundle.forEach((bundleRows) => {
      // A root's hosts come from the row resolve sends, not this second read: an edit committed between the two would
      // otherwise pair the old wildcard with the overrides of the new one and drop a restriction neither state has.
      const bundleRoots = bundleRows
        .filter((row) => rootById.has(row.id))
        .map((row) => ({ ...row, hostPattern: rootById.get(row.id)!.hostPattern }));
      const position = Math.min(...bundleRoots.map((row) => rootById.get(row.id)!.position));
      const reached = new Set(bundleRoots.map((row) => row.id));
      let frontier: typeof bundleRows = bundleRoots;
      while (frontier.length) {
        const wildcards = frontier.flatMap(wildcardsOf);
        frontier = wildcards.length
          ? bundleRows.filter((row) => !reached.has(row.id) && coversExactHostOf(wildcards, row))
          : [];
        frontier.forEach((row) => {
          reached.add(row.id);
          if (!presentIds.has(row.id) && !overrides.has(row.id)) {
            overrides.set(row.id, { ...row, position, isOverride: true });
          }
        });
      }
    });
    return [...overrides.values()];
  };

  /**
   * The hot path, and an intersection: the services a session reaches through its bundle and the ones it lists are a
   * ceiling fixed at mint, re-checked against the owner's roles on every resolve, so losing access empties a running
   * session without touching its rows. A listed service stays only while the owner can use it, directly or through a
   * bundle that holds it. One reached only through bundles brings those bundles' overrides of its hosts with it. Services
   * through the bundle come first, then the listed ones, then the overrides.
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
    if (scope.accessBundleIds?.length === 0 && scope.serviceIds?.length === 0) return [];
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

      const listedQuery = conn(TableName.AgentVaultSessionService)
        .where(`${TableName.AgentVaultSessionService}.sessionId`, scope.sessionId)
        .join(
          TableName.AgentVaultService,
          `${TableName.AgentVaultService}.id`,
          `${TableName.AgentVaultSessionService}.serviceId`
        )
        .where(`${TableName.AgentVaultService}.projectId`, scope.projectId)
        .whereNull(`${TableName.AgentVaultService}.sessionId`);
      whereUsable(conn, listedQuery, {
        table: TableName.AgentVaultService,
        linkTable: TableName.AgentVaultAccessBundleService,
        linkColumn: "serviceId",
        directIds: scope.serviceIds,
        accessBundleIds: scope.accessBundleIds
      });
      const listedRows = (await listedQuery
        .select(
          ...serviceColumns,
          db.raw("NULL::uuid AS ??", ["accessBundleId"]),
          db.raw("NULL::text AS ??", ["accessBundleName"]),
          db.ref("position").withSchema(TableName.AgentVaultSessionService)
        )
        .orderBy(`${TableName.AgentVaultSessionService}.position`, "asc")) as unknown as TResolveServiceRow[];

      // A service the session lists that its bundle also holds is sent once, as the bundle's, with the bundle's
      // overrides already beside it.
      const throughBundleIds = new Set(throughBundle.map((row) => row.id));
      const listedOnly = listedRows.filter((row) => !throughBundleIds.has(row.id));
      const present = [...throughBundle, ...listedOnly];
      // An owner who can use a service directly could name it alone anyway, so it brings no overrides. One reached
      // only through bundles brings theirs, as a session carrying the bundle would.
      const directIds = scope.serviceIds === null ? null : new Set(scope.serviceIds);
      const reachedThroughBundles = directIds ? listedOnly.filter((row) => !directIds.has(row.id)) : [];
      const overrides = reachedThroughBundles.length
        ? await findOverridesOfServices(
            conn,
            { projectId: scope.projectId, accessBundleIds: scope.accessBundleIds },
            reachedThroughBundles,
            new Set(present.map((row) => row.id))
          )
        : [];
      const resolvable = [...present, ...overrides];
      // Narrowed after the overrides are found, since one can only be found through the service it overrides.
      return serviceId ? resolvable.filter((row) => row.id === serviceId) : resolvable;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find resolvable agent vault services" });
    }
  };

  // The overrides resolve would send beside these listed services, reached only through the bundles in accessBundleIds
  // (null for every bundle), so a mint can check what it is about to send against them.
  const findServiceOverrides = async (
    {
      projectId,
      accessBundleIds,
      services
    }: {
      projectId: string;
      accessBundleIds: string[] | null;
      services: Pick<TResolveServiceRow, "id" | "hostPattern">[];
    },
    tx?: Knex
  ) => {
    if (accessBundleIds?.length === 0 || !services.length) return [];
    try {
      return await findOverridesOfServices(
        tx || db.replicaNode(),
        { projectId, accessBundleIds },
        services.map((service, position) => ({ ...service, position })),
        new Set(services.map(({ id }) => id))
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault service overrides" });
    }
  };

  /**
   * The latest version of each skill the session reaches through its bundle or names, once. Like the services, both are
   * a ceiling fixed at mint and re-checked against the owner's roles: a listed skill stays only while the owner can use
   * it, directly or through a bundle that holds it. A skill through the bundle is credited to the first of the session's
   * bundles that carries it, and one the bundle also holds is sent once, as the bundle's. Reads the primary: this runs
   * once per agent start, and a skill published a moment before must not arrive a version late.
   */
  const findSessionSkills = async (scope: TResolveScope, tx?: Knex): Promise<TResolveSkillRow[]> => {
    if (scope.accessBundleIds?.length === 0 && scope.skillIds?.length === 0) return [];
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

      const listedQuery = conn(TableName.AgentVaultSessionSkill)
        .where(`${TableName.AgentVaultSessionSkill}.sessionId`, scope.sessionId)
        .join(
          TableName.AgentVaultSkill,
          `${TableName.AgentVaultSkill}.id`,
          `${TableName.AgentVaultSessionSkill}.skillId`
        )
        .where(`${TableName.AgentVaultSkill}.projectId`, scope.projectId)
        .whereNull(`${TableName.AgentVaultSkill}.sessionId`)
        .join(TableName.AgentVaultSkillVersion, latestVersion);
      whereUsable(conn, listedQuery, {
        table: TableName.AgentVaultSkill,
        linkTable: TableName.AgentVaultAccessBundleSkill,
        linkColumn: "skillId",
        directIds: scope.skillIds,
        accessBundleIds: scope.accessBundleIds
      });
      const listedRows = (await listedQuery.select(
        ...skillColumns,
        db.raw("NULL::uuid AS ??", ["accessBundleId"]),
        db.raw("NULL::text AS ??", ["accessBundleName"])
      )) as unknown as TResolveSkillRow[];

      const throughBundleIds = new Set(throughBundle.map((row) => row.id));
      return [...throughBundle, ...listedRows.filter((row) => !throughBundleIds.has(row.id))].sort((a, b) =>
        a.name < b.name ? -1 : 1
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault session skills" });
    }
  };

  // The session's bundles the actor can still reach, in the order they were minted with, whether or not they hold a
  // service.
  const findReachableBundles = async (
    { onPrimary, ...scope }: Pick<TResolveScope, "sessionId" | "projectId" | "accessBundleIds"> & TResolveReadOptions,
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

  return { findResolvableServices, findServiceOverrides, findSessionSkills, findReachableBundles };
};
