import { createMongoAbility, MongoAbility } from "@casl/ability";
import { describe, expect, test } from "vitest";

import { ProjectMembershipRole } from "@app/db/schemas";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { ActorType } from "@app/services/auth/auth-type";

import {
  classifySecretReads,
  computeSecretReach,
  coversWholeWindow,
  getUtcMonthStart,
  indexSecretReads,
  summarizeSecretAccess,
  toActorKey,
  toUnusedAccessRoles
} from "./secret-read-activity-fns";
import {
  SecretReadObjectType,
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

const read = (overrides: Partial<TSecretLastRead>): TSecretLastRead => ({
  objectId: "shared",
  objectType: SecretReadObjectType.Folder,
  actorId: "identity-1",
  actorType: ActorType.IDENTITY,
  lastReadAt: new Date("2026-10-10T00:00:00.000Z"),
  ...overrides
});

const trackedSince = new Date("2026-10-01T00:00:00.000Z");

describe("getUtcMonthStart", () => {
  test("uses the UTC month, not the local one", () => {
    expect(getUtcMonthStart(new Date("2026-10-31T23:59:59.999Z"))).toEqual(new Date("2026-10-01T00:00:00.000Z"));
    expect(getUtcMonthStart(new Date("2026-11-01T00:00:00.000Z"))).toEqual(new Date("2026-11-01T00:00:00.000Z"));
  });

  test("rolls over into the next and previous year", () => {
    expect(getUtcMonthStart(new Date("2026-12-15T00:00:00.000Z"), 1)).toEqual(new Date("2027-01-01T00:00:00.000Z"));
    expect(getUtcMonthStart(new Date("2026-01-15T00:00:00.000Z"), -1)).toEqual(new Date("2025-12-01T00:00:00.000Z"));
  });
});

describe("computeSecretReach", () => {
  const reach = computeSecretReach(dbPass, graph);

  test("follows references transitively and stops at cycles", () => {
    expect([...reach.secretIds].sort()).toEqual([connection.id, dbPass.id, dbUrl.id].sort());
  });

  test("includes the folders holding referencing secrets and every folder importing them, transitively", () => {
    expect([...reach.folderIds].sort()).toEqual(["consumer", "edge", "nested", "shared"]);
  });
});

describe("classifySecretReads", () => {
  const reach = computeSecretReach(dbPass, graph);
  const classify = (reads: TSecretLastRead[]) =>
    classifySecretReads(indexSecretReads(reads), reach, trackedSince).get(`${ActorType.IDENTITY}:identity-1`);

  test("counts a read of a folder that imports the secret through a chain", () => {
    expect(classify([read({ objectId: "edge" })])).toBeDefined();
  });

  test("counts a single read of a secret that references it", () => {
    expect(classify([read({ objectId: connection.id, objectType: SecretReadObjectType.Secret })])).toBeDefined();
  });

  test("ignores a single read of an unrelated secret, and a folder read recorded under a secret's id", () => {
    expect(classify([read({ objectId: "unrelated", objectType: SecretReadObjectType.Secret })])).toBeUndefined();
    expect(classify([read({ objectId: dbPass.id, objectType: SecretReadObjectType.Folder })])).toBeUndefined();
  });

  test("counts an unexpanded read only for the secret it returned, not the secrets it references", () => {
    expect(classify([read({ objectId: dbPass.id, objectType: SecretReadObjectType.SecretUnexpanded })])).toBeDefined();
    expect(
      classify([read({ objectId: connection.id, objectType: SecretReadObjectType.SecretUnexpanded })])
    ).toBeUndefined();
  });

  test("ignores reads from before the secret was tracked", () => {
    expect(classify([read({ lastReadAt: new Date("2026-09-30T00:00:00.000Z") })])).toBeUndefined();
  });

  test("keeps the latest read across all the ways the secret was reached", () => {
    const latestRead = new Date("2026-10-12T00:00:00.000Z");
    expect(
      classify([
        read({ lastReadAt: new Date("2026-10-05T00:00:00.000Z") }),
        read({ objectId: "consumer", lastReadAt: latestRead }),
        read({ objectId: dbUrl.id, objectType: SecretReadObjectType.Secret })
      ])
    ).toEqual({
      actorType: ActorType.IDENTITY,
      actorId: "identity-1",
      lastReadAt: latestRead
    });
  });
});

describe("coversWholeWindow", () => {
  const windowStart = new Date("2026-09-15T00:00:00.000Z");

  test("is true once the secret and the access have both existed for the whole window", () => {
    expect(coversWholeWindow(windowStart, new Date("2026-08-01T00:00:00.000Z"), windowStart)).toBe(true);
    expect(coversWholeWindow(windowStart, undefined, windowStart)).toBe(true);
  });

  test("is false for a secret newer than the window", () => {
    expect(coversWholeWindow(new Date("2026-10-01T00:00:00.000Z"), undefined, windowStart)).toBe(false);
  });

  test("is false for a reader whose access changed inside the window", () => {
    expect(coversWholeWindow(windowStart, new Date("2026-10-10T00:00:00.000Z"), windowStart)).toBe(false);
  });
});

describe("summarizeSecretAccess", () => {
  const judgedFrom = new Date("2026-09-15T00:00:00.000Z");
  const canRead = createMongoAbility<MongoAbility<ProjectPermissionSet>>([
    { action: ProjectPermissionSecretActions.ReadValue, subject: ProjectPermissionSub.Secrets }
  ]);
  const cannotRead = createMongoAbility<MongoAbility<ProjectPermissionSet>>([]);
  const reader = (actorId: string, permission = canRead) => ({
    actorType: ActorType.USER as const,
    actorId,
    permission
  });
  const activity = (overrides: Partial<TSecretActivity> = {}): TSecretActivity => ({
    secret: { key: "DB_PASS", tags: [] } as unknown as TSecretActivity["secret"],
    environment: "prod",
    secretPath: "/",
    trackedSince: judgedFrom,
    reads: new Map(),
    ...overrides
  });
  const access = (overrides: Partial<TProjectAccess> = {}): TProjectAccess => ({
    readersByRules: [[reader("direct"), reader("via-group")], [reader("no-access", cannotRead)]],
    adminActorIds: new Set(),
    accessChangedAtByActorId: new Map(),
    judgedFrom,
    ...overrides
  });
  const ids = (readers: { actorId: string }[]) => readers.map((entry) => entry.actorId).sort();
  const readBy = (actorId: string) =>
    new Map([
      [
        toActorKey(ActorType.USER, actorId),
        { actorType: ActorType.USER as const, actorId, lastReadAt: new Date("2026-10-01T00:00:00.000Z") }
      ]
    ]);

  test("lists each reader who can read the value once, however many memberships give it", () => {
    const summary = summarizeSecretAccess(
      activity(),
      access({ readersByRules: [[reader("direct")], [reader("direct"), reader("via-group")]] })
    );
    expect(ids(summary.entitled)).toEqual(["direct", "via-group"]);
  });

  test("leaves admins out of unused access, and never counts their reads as a ghost's", () => {
    const summary = summarizeSecretAccess(
      activity({ reads: readBy("admin") }),
      access({ readersByRules: [[reader("admin"), reader("direct")]], adminActorIds: new Set(["admin"]) })
    );
    expect(ids(summary.entitled)).toEqual(["admin", "direct"]);
    expect(ids(summary.nonAdmins)).toEqual(["direct"]);
    expect(ids(summary.unread)).toEqual(["direct"]);
    expect(summary.ghostReaders).toEqual([]);
  });

  test("does not count a reader who read it, or whose access changed inside the judged period", () => {
    const summary = summarizeSecretAccess(
      activity({ reads: readBy("direct") }),
      access({ accessChangedAtByActorId: new Map([["via-group", new Date("2026-10-01T00:00:00.000Z")]]) })
    );
    expect(summary.unread).toEqual([]);
  });

  test("does not count a secret newer than the judged period", () => {
    const summary = summarizeSecretAccess(activity({ trackedSince: new Date("2026-10-01T00:00:00.000Z") }), access());
    expect(summary.unread).toEqual([]);
  });

  test("counts a read by someone who can no longer read it as a ghost's", () => {
    const summary = summarizeSecretAccess(activity({ reads: readBy("no-access") }), access());
    expect(ids(summary.ghostReaders)).toEqual(["no-access"]);
  });
});

describe("toUnusedAccessRoles", () => {
  test("names built-in roles after their predefined role and keeps a custom role's id and name", () => {
    expect(
      toUnusedAccessRoles([
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

  test("lists a role held twice once", () => {
    expect(
      toUnusedAccessRoles([{ role: ProjectMembershipRole.Viewer }, { role: ProjectMembershipRole.Viewer }])
    ).toEqual([{ id: null, slug: "viewer", name: "Viewer" }]);
  });
});
