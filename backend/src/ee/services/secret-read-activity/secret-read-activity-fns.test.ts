import { createMongoAbility, MongoAbility } from "@casl/ability";
import { describe, expect, test } from "vitest";

import { ProjectMembershipRole } from "@app/db/schemas";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { ActorType } from "@app/services/auth/auth-type";
import { LEVEL_BREAK } from "@app/services/secret-import/secret-import-fns";
import { MAX_SECRET_REFERENCE_DEPTH } from "@app/services/secret-v2-bridge/secret-reference-fns";

import {
  classifySecretReads,
  computeSecretReach,
  coversWholeWindow,
  createAccessDating,
  getReadStatus,
  getUtcMonthStart,
  indexSecretReads,
  summarizeSecretAccess,
  toUnusedAccessRoles
} from "./secret-read-activity-fns";
import {
  SecretReadNotJudgedReason,
  SecretReadObjectType,
  SecretReadStatus,
  TAccessSource,
  TProjectAccess,
  TReachSecret,
  TSecretActivity,
  TSecretLastRead,
  TSecretReachGraph
} from "./secret-read-activity-types";

const dbPass: TReachSecret = { id: "db-pass", folderId: "shared", key: "DB_PASS" };
const dbUrl: TReachSecret = { id: "db-url", folderId: "shared", key: "DB_URL" };
const connection: TReachSecret = { id: "connection", folderId: "nested", key: "CONNECTION" };

// DB_URL references DB_PASS locally, CONNECTION references DB_URL, and CONNECTION back to DB_PASS closes a cycle.
// The consumer folder imports the nested folder, and the edge folder imports the consumer folder.
const graph: TSecretReachGraph = {
  getReferencers: (secret) =>
    ({ [dbPass.id]: [dbUrl], [dbUrl.id]: [connection], [connection.id]: [dbPass] })[secret.id] ?? [],
  getImporterFolderIds: (folderId) => ({ nested: ["consumer"], consumer: ["edge"] })[folderId] ?? []
};

const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
const sept = day("2026-09-01");
const oct = day("2026-10-20");

const read = (overrides: Partial<TSecretLastRead>): TSecretLastRead => ({
  objectId: "shared",
  objectType: SecretReadObjectType.Folder,
  actorId: "identity-1",
  actorType: ActorType.IDENTITY,
  lastReadAt: day("2026-10-10"),
  ...overrides
});

const ability = (rules: Parameters<typeof createMongoAbility>[0]) =>
  createMongoAbility<MongoAbility<ProjectPermissionSet>>(rules as never);
const readsAll = ability([{ action: ProjectPermissionSecretActions.ReadValue, subject: ProjectPermissionSub.Secrets }]);
const readsProd = ability([
  {
    action: ProjectPermissionSecretActions.ReadValue,
    subject: ProjectPermissionSub.Secrets,
    conditions: { environment: "prod" }
  }
]);

const activity = (overrides: Partial<TSecretActivity> = {}): TSecretActivity => ({
  secret: { key: "DB_PASS", tags: [], folderId: "f1" } as unknown as TSecretActivity["secret"],
  environment: "prod",
  secretPath: "/",
  trackedSince: sept,
  reads: new Map(),
  ...overrides
});

describe("getUtcMonthStart", () => {
  test("uses the UTC month and rolls over years", () => {
    expect(getUtcMonthStart(new Date("2026-10-31T23:59:59.999Z"))).toEqual(day("2026-10-01"));
    expect(getUtcMonthStart(day("2026-12-15"), 1)).toEqual(day("2027-01-01"));
    expect(getUtcMonthStart(day("2026-01-15"), -1)).toEqual(day("2025-12-01"));
  });
});

describe("computeSecretReach", () => {
  test("follows references transitively, stops at cycles, and includes every importing folder", () => {
    const reach = computeSecretReach(dbPass, graph);
    expect([...reach.secretIds].sort()).toEqual([connection.id, dbPass.id, dbUrl.id].sort());
    expect([...reach.folderIds].sort()).toEqual(["consumer", "edge", "nested", "shared"]);
  });

  test("stops at the depth a read expands references to", () => {
    const chain: TReachSecret[] = Array.from({ length: MAX_SECRET_REFERENCE_DEPTH + 3 }, (_, index) => ({
      id: `s${index}`,
      folderId: `f${index}`,
      key: `S${index}`
    }));
    const reach = computeSecretReach(chain[0], {
      getReferencers: (secret) => {
        const next = chain[chain.indexOf(secret) + 1];
        return next ? [next] : [];
      },
      getImporterFolderIds: () => []
    });
    expect(reach.secretIds.has(chain[MAX_SECRET_REFERENCE_DEPTH + 1].id)).toBe(true);
    expect(reach.secretIds.has(chain[MAX_SECRET_REFERENCE_DEPTH + 2].id)).toBe(false);
  });

  test("stops at the depth a read follows imports to", () => {
    const reach = computeSecretReach(dbPass, {
      getReferencers: () => [],
      getImporterFolderIds: (folderId) => [`${folderId}-importer`]
    });
    expect(reach.folderIds.has(`shared${"-importer".repeat(LEVEL_BREAK + 1)}`)).toBe(true);
    expect(reach.folderIds.has(`shared${"-importer".repeat(LEVEL_BREAK + 2)}`)).toBe(false);
  });
});

describe("classifySecretReads", () => {
  const trackedSince = day("2026-10-01");
  const classify = (reads: TSecretLastRead[]) =>
    classifySecretReads(indexSecretReads(reads), computeSecretReach(dbPass, graph), trackedSince).get("identity-1");

  test("counts reads of the secret, of secrets referencing it and of folders importing it, from trackedSince", () => {
    expect(classify([read({ objectId: "edge" })])).toBeDefined();
    expect(classify([read({ objectId: connection.id, objectType: SecretReadObjectType.Secret })])).toBeDefined();
    expect(classify([read({ objectId: "unrelated", objectType: SecretReadObjectType.Secret })])).toBeUndefined();
    expect(classify([read({ objectId: dbPass.id, objectType: SecretReadObjectType.Folder })])).toBeUndefined();
    expect(classify([read({ lastReadAt: day("2026-09-30") })])).toBeUndefined();
  });

  test("counts an unexpanded read only for the secret it returned, not the secrets it references", () => {
    expect(classify([read({ objectId: dbPass.id, objectType: SecretReadObjectType.SecretUnexpanded })])).toBeDefined();
    expect(
      classify([read({ objectId: connection.id, objectType: SecretReadObjectType.SecretUnexpanded })])
    ).toBeUndefined();
  });

  test("counts a personal secret referencing it only when that secret itself is read, not its folder", () => {
    const aliceUrl: TReachSecret = { id: "alice-db-url", folderId: "app", key: "DB_URL", userId: "alice" };
    const reach = computeSecretReach(dbPass, {
      getReferencers: (secret) => (secret.id === dbPass.id ? [aliceUrl] : []),
      getImporterFolderIds: () => []
    });
    const readerIds = (reads: TSecretLastRead[]) => [
      ...classifySecretReads(indexSecretReads(reads), reach, trackedSince).keys()
    ];
    expect(readerIds([read({ objectId: "app", actorId: "alice" })])).toEqual([]);
    expect(
      readerIds([read({ objectId: aliceUrl.id, objectType: SecretReadObjectType.Secret, actorId: "alice" })])
    ).toEqual(["alice"]);
  });

  test("keeps the latest read overall, and separately the latest read of the secret itself", () => {
    expect(
      classify([
        read({ lastReadAt: day("2026-10-05") }),
        read({ objectId: dbPass.id, objectType: SecretReadObjectType.Secret, lastReadAt: day("2026-10-11") }),
        read({ objectId: dbUrl.id, objectType: SecretReadObjectType.Secret, lastReadAt: day("2026-10-13") })
      ])
    ).toEqual({
      actorType: ActorType.IDENTITY,
      actorId: "identity-1",
      lastReadAt: day("2026-10-13"),
      lastSecretReadAt: day("2026-10-11")
    });
  });
});

describe("coversWholeWindow", () => {
  test("needs both the secret and the access to predate the window", () => {
    expect(coversWholeWindow(sept, day("2026-08-01"), sept)).toBe(true);
    expect(coversWholeWindow(sept, undefined, sept)).toBe(true);
    expect(coversWholeWindow(oct, undefined, sept)).toBe(false);
    expect(coversWholeWindow(sept, oct, sept)).toBe(false);
  });
});

describe("summarizeSecretAccess", () => {
  const judgedFrom = day("2026-09-15");
  const reader = (actorId: string, permission = readsAll) => ({
    actorType: ActorType.USER as const,
    actorId,
    permission
  });
  const datedAccess = (accessSince: Record<string, Date>) => ({
    accessSinceOf: ({ actorId }: { actorId: string }) => accessSince[actorId],
    latestAccessChangeOf: ({ actorId }: { actorId: string }) => accessSince[actorId]
  });
  const access = (overrides: Partial<TProjectAccess> = {}): TProjectAccess => ({
    readersByRules: [[reader("direct"), reader("via-group")], [reader("no-access", ability([]))]],
    adminActorIds: new Set(),
    judgedFrom,
    ...datedAccess({}),
    ...overrides
  });
  const ids = (readers: { actorId: string }[]) => readers.map((entry) => entry.actorId).sort();
  const readBy = (actorId: string, lastSecretReadAt?: Date) =>
    new Map([
      [actorId, { actorType: ActorType.USER as const, actorId, lastReadAt: day("2026-10-01"), lastSecretReadAt }]
    ]);

  test("lists each reader who can read the value once, and judges only the non-admins", () => {
    const summary = summarizeSecretAccess(
      activity({ trackedSince: judgedFrom }),
      access({
        readersByRules: [[reader("admin"), reader("direct")], [reader("direct")]],
        adminActorIds: new Set(["admin"])
      })
    );
    expect(ids(summary.entitled)).toEqual(["admin", "direct"]);
    expect(ids(summary.nonAdmins)).toEqual(["direct"]);
    expect(ids(summary.unread)).toEqual(["direct"]);
  });

  test("does not count a reader who read it, whose access is newer than the judged period, or a secret that is", () => {
    const summary = summarizeSecretAccess(
      activity({ trackedSince: judgedFrom, reads: readBy("direct") }),
      access(datedAccess({ "via-group": oct }))
    );
    expect(summary.unread).toEqual([]);
    expect(summarizeSecretAccess(activity({ trackedSince: oct }), access()).unread).toEqual([]);
    expect(
      ids(summarizeSecretAccess(activity({ trackedSince: judgedFrom }), access(datedAccess({ direct: sept }))).unread)
    ).toEqual(["direct", "via-group"]);
  });

  test("drops a folder read from before the reader had access, but keeps a read of the secret itself", () => {
    const before = summarizeSecretAccess(activity({ reads: readBy("direct") }), access(datedAccess({ direct: oct })));
    expect(before.readsByActorId.has("direct")).toBe(false);
    const after = summarizeSecretAccess(activity({ reads: readBy("direct") }), access(datedAccess({ direct: sept })));
    expect(after.readsByActorId.get("direct")?.lastReadAt).toEqual(day("2026-10-01"));
    const ofTheSecret = summarizeSecretAccess(
      activity({ reads: readBy("direct", day("2026-09-20")) }),
      access(datedAccess({ direct: oct }))
    );
    expect(ofTheSecret.readsByActorId.get("direct")?.lastReadAt).toEqual(day("2026-09-20"));
  });
});

describe("getReadStatus", () => {
  const status = (overrides: Partial<Parameters<typeof getReadStatus>[0]> = {}) =>
    getReadStatus({
      lastReadAt: null,
      isUnused: false,
      isProjectAdmin: false,
      accessSince: sept,
      judgedFrom: day("2026-09-15"),
      trackingStartedAt: day("2026-08-01"),
      ...overrides
    });
  const notJudged = (notJudgedReason: SecretReadNotJudgedReason) => ({
    readStatus: SecretReadStatus.NotJudged,
    notJudgedReason
  });

  test("is read, unused, or not judged for one of four reasons", () => {
    expect(status({ lastReadAt: oct, isProjectAdmin: true })).toEqual({
      readStatus: SecretReadStatus.Read,
      notJudgedReason: null
    });
    expect(status({ isUnused: true })).toEqual({ readStatus: SecretReadStatus.Unused, notJudgedReason: null });
    expect(status({ isProjectAdmin: true, accessSince: oct })).toEqual(
      notJudged(SecretReadNotJudgedReason.ProjectAdmin)
    );
    expect(status({ trackingStartedAt: oct, accessSince: oct })).toEqual(
      notJudged(SecretReadNotJudgedReason.TrackingTooNew)
    );
    expect(status({ accessSince: oct })).toEqual(notJudged(SecretReadNotJudgedReason.AccessTooNew));
    expect(status()).toEqual(notJudged(SecretReadNotJudgedReason.SecretTooNew));
  });
});

describe("createAccessDating", () => {
  const actor = { actorId: "actor" };
  const secretIn = (environment: string, folderId: string) =>
    activity({ secret: { key: "DB_PASS", tags: [], folderId } as unknown as TSecretActivity["secret"], environment });
  const dating = (
    sources: TAccessSource[],
    folderReopenedAt = new Map<string, Date>(),
    accessReopenedAt = new Map<string, Date>()
  ) => createAccessDating({ actor: sources }, folderReopenedAt, accessReopenedAt);

  test("dates a secret from the oldest source that grants it on its own, else from the newest source", () => {
    const { accessSinceOf, latestAccessChangeOf } = dating([
      { date: sept, permission: () => readsProd },
      { date: oct, permission: () => readsAll }
    ]);
    expect(accessSinceOf(actor, secretIn("prod", "f1"))).toEqual(sept);
    expect(accessSinceOf(actor, secretIn("dev", "f1"))).toEqual(oct);
    expect(latestAccessChangeOf(actor)).toEqual(oct);
    const { accessSinceOf: noneGrants } = dating([
      { date: sept, permission: () => ability([]) },
      { date: oct, permission: () => ability([]) }
    ]);
    expect(noneGrants(actor, secretIn("prod", "f1"))).toEqual(oct);
  });

  test("only lets a folder grant reach secrets in its own folder", () => {
    const { accessSinceOf } = dating([
      { date: sept, permission: () => readsProd },
      { date: oct, folderId: "granted", permission: () => readsAll }
    ]);
    expect(accessSinceOf(actor, secretIn("prod", "other"))).toEqual(sept);
    expect(accessSinceOf(actor, secretIn("dev", "granted"))).toEqual(oct);
  });

  test("dates access no earlier than an ended restriction: an expired or edited folder grant in its folder, an expired temporary role anywhere", () => {
    const expired = dating([{ date: sept, permission: () => readsAll }], new Map([["actor:held-back", oct]]));
    expect(expired.accessSinceOf(actor, secretIn("prod", "held-back"))).toEqual(oct);
    expect(expired.accessSinceOf(actor, secretIn("prod", "f1"))).toEqual(sept);
    expect(expired.latestAccessChangeOf(actor)).toEqual(oct);

    const edited = dating([
      { date: sept, permission: () => readsAll },
      { date: oct, folderId: "granted", restartsFolder: true, permission: () => readsAll }
    ]);
    expect(edited.accessSinceOf(actor, secretIn("prod", "granted"))).toEqual(oct);
    expect(edited.accessSinceOf(actor, secretIn("prod", "f1"))).toEqual(sept);

    const expiredRole = dating([{ date: sept, permission: () => readsAll }], new Map(), new Map([["actor", oct]]));
    expect(expiredRole.accessSinceOf(actor, secretIn("prod", "f1"))).toEqual(oct);
    expect(expiredRole.latestAccessChangeOf(actor)).toEqual(oct);
  });

  test("checks a source shared by many actors once per secret", () => {
    let builds = 0;
    const shared = () => {
      builds += 1;
      return readsAll;
    };
    const { accessSinceOf } = createAccessDating(
      { a: [{ date: sept, permission: shared }], b: [{ date: sept, permission: shared }] },
      new Map(),
      new Map()
    );
    const secret = secretIn("prod", "f1");
    expect(accessSinceOf({ actorId: "a" }, secret)).toEqual(sept);
    expect(accessSinceOf({ actorId: "b" }, secret)).toEqual(sept);
    expect(builds).toBe(2);
  });
});

describe("toUnusedAccessRoles", () => {
  test("names built-in roles after their predefined role, keeps a custom role's id and name, and lists each once", () => {
    expect(
      toUnusedAccessRoles([
        { role: ProjectMembershipRole.Member },
        { role: ProjectMembershipRole.Member },
        {
          role: ProjectMembershipRole.Custom,
          customRoleSlug: "deployer",
          customRoleId: "role-1",
          customRoleName: "Deployer"
        }
      ])
    ).toEqual([
      { id: null, slug: "member", name: "Member" },
      { id: "role-1", slug: "custom", name: "Deployer" }
    ]);
  });
});
