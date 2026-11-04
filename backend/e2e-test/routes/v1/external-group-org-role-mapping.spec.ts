import { randomUUID } from "node:crypto";

import { packRules } from "@casl/ability/extra";
import jwt from "jsonwebtoken";

import { AccessScope, OrgMembershipRole, OrgMembershipStatus, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { PgSqlLock } from "@app/keystore/keystore";
import { getConfig, initEnvConfig } from "@app/lib/config/env";
import { initLogger, logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";

// SCIM applies a stored mapping to newly provisioned members with no user in the loop, so saving a
// mapping is the grant. These cases run against real Postgres, which the service tests cannot: a
// save must not land on a mapping set other than the one it was authorized against. The audit
// ordering is pinned in external-group-org-role-mapping-router.test.ts, since the e2e plan drops
// audit entries before anything observable.

const orgId = seedData1.organization.id;
const URL = "/api/v1/scim/group-org-role-mappings";

const adminHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });

const createOrgUser = async (label: string, role: { role: string; customRoleId?: string }) => {
  const username = `scim-mapping-${label}-${alphaNumericNanoId(8)}@example.com`;
  const [user] = await testDb(TableName.Users)
    .insert({ username, email: username, isGhost: false, isAccepted: true, authMethods: [AuthMethod.EMAIL] })
    .returning("*");

  const [membership] = await testDb(TableName.Membership)
    .insert({
      scope: AccessScope.Organization,
      scopeOrgId: orgId,
      actorUserId: user.id,
      status: OrgMembershipStatus.Accepted,
      isActive: true
    })
    .returning("*");
  await testDb(TableName.MembershipRole).insert({ membershipId: membership.id, ...role });

  const sessionId = randomUUID();
  await testDb(TableName.AuthTokenSession).insert({
    id: sessionId,
    userId: user.id,
    ip: "127.0.0.1",
    userAgent: "e2e-scim-mapping",
    accessVersion: 1,
    refreshVersion: 1,
    lastUsed: new Date()
  } as never);

  const token = jwt.sign(
    {
      authTokenType: AuthTokenType.ACCESS_TOKEN,
      userId: user.id,
      tokenVersionId: sessionId,
      authMethod: AuthMethod.EMAIL,
      organizationId: orgId,
      accessVersion: 1
    },
    getConfig().AUTH_SECRET,
    { expiresIn: 3600 }
  );

  return { userId: user.id, sessionId, headers: { authorization: `Bearer ${token}` } };
};

const storedMappings = async () =>
  (
    await testDb(TableName.ExternalGroupOrgRoleMapping)
      .where({ orgId })
      .select("groupName", "role")
      .orderBy("groupName")
  ).map(({ groupName, role }: { groupName: string; role: string }) => `${groupName}=${role}`);

const putMappings = (headers: Record<string, string>, mappings: [string, string][]) =>
  testServer.inject({
    method: "PUT",
    url: URL,
    headers,
    body: { mappings: mappings.map(([groupName, roleSlug]) => ({ groupName, roleSlug })) }
  });

const waitForLockWaiter = async (lockKey: number, deadline = Date.now() + 3_000): Promise<void> => {
  const { rows } = await testDb.raw(
    "SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND objid = ?",
    [lockKey]
  );
  if (rows[0].waiting > 0) return;
  if (Date.now() > deadline) throw new Error("the save never reached the write lock");
  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
  return waitForLockWaiter(lockKey, deadline);
};

describe("SCIM group to org role mappings", () => {
  let editor: Awaited<ReturnType<typeof createOrgUser>>;
  let member: Awaited<ReturnType<typeof createOrgUser>>;
  let editorRoleId: string;

  beforeAll(async () => {
    initLogger();
    await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);

    // `scim` edit alone: enough for the route's own check, not enough to hand out org roles.
    const [role] = await testDb(TableName.Role)
      .insert({
        name: "e2e-scim-mapping-editor",
        slug: `e2e-scim-mapping-editor-${alphaNumericNanoId(8)}`,
        orgId,
        permissions: JSON.stringify(packRules([{ subject: "scim", action: ["read", "edit"] }] as never))
      })
      .returning("*");
    editorRoleId = role.id;

    editor = await createOrgUser("editor", { role: OrgMembershipRole.Custom, customRoleId: editorRoleId });
    member = await createOrgUser("member", { role: OrgMembershipRole.Member });
  });

  beforeEach(async () => {
    await testDb(TableName.ExternalGroupOrgRoleMapping).where({ orgId }).del();
  });

  afterAll(async () => {
    await testDb(TableName.ExternalGroupOrgRoleMapping).where({ orgId }).del();
    const actors = [editor, member].filter(Boolean);
    await testDb(TableName.AuthTokenSession)
      .whereIn(
        "id",
        actors.map((actor) => actor.sessionId)
      )
      .del();
    await testDb(TableName.Membership)
      .whereIn(
        "actorUserId",
        actors.map((actor) => actor.userId)
      )
      .del();
    await testDb(TableName.Users)
      .whereIn(
        "id",
        actors.map((actor) => actor.userId)
      )
      .del();
    await testDb(TableName.Role).where({ id: editorRoleId }).del();
  });

  test("a mapping the editor cannot grant is refused and nothing is stored", async () => {
    const res = await putMappings(editor.headers, [["g-escalate", OrgMembershipRole.Admin]]);

    expect(res.statusCode, res.payload).toBe(403);
    expect(await storedMappings()).toEqual([]);
  });

  test("the editor can store a mapping that grants nothing", async () => {
    const res = await putMappings(editor.headers, [["g-none", OrgMembershipRole.NoAccess]]);

    expect(res.statusCode, res.payload).toBe(200);
    expect(await storedMappings()).toEqual([`g-none=${OrgMembershipRole.NoAccess}`]);
  });

  test("a caller without scim read is refused the list", async () => {
    const res = await testServer.inject({ method: "GET", url: URL, headers: member.headers });

    expect(res.statusCode, res.payload).toBe(403);
  });

  // Control for the race case below: without a concurrent change, the same request succeeds.
  test("the editor can resubmit an admin mapping unchanged", async () => {
    const seed = await putMappings(adminHeaders(), [["g-admin", OrgMembershipRole.Admin]]);
    expect(seed.statusCode, seed.payload).toBe(200);

    const res = await putMappings(editor.headers, [
      ["g-admin", OrgMembershipRole.Admin],
      ["g-none", OrgMembershipRole.NoAccess]
    ]);

    expect(res.statusCode, res.payload).toBe(200);
    expect(await storedMappings()).toEqual([
      `g-admin=${OrgMembershipRole.Admin}`,
      `g-none=${OrgMembershipRole.NoAccess}`
    ]);
  });

  test("a group named twice is a 400, not a unique-index 500", async () => {
    const res = await putMappings(adminHeaders(), [
      ["g-twice", OrgMembershipRole.NoAccess],
      ["g-twice", OrgMembershipRole.NoAccess]
    ]);

    expect(res.statusCode, res.payload).toBe(400);
    expect(await storedMappings()).toEqual([]);
  });

  // The editor resubmits an admin mapping unchanged, which needs no grant. If an admin removes it
  // after the editor's checks ran but before the write, the write must not put it back.
  test("a save authorized against a stale snapshot is refused instead of restoring a removed mapping", async () => {
    const seed = await putMappings(adminHeaders(), [["g-admin", OrgMembershipRole.Admin]]);
    expect(seed.statusCode, seed.payload).toBe(200);

    const lockKey = PgSqlLock.ExternalGroupOrgRoleMappingUpdate(orgId);
    let releaseLock!: () => void;
    const lockReleased = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    let lockTaken!: () => void;
    const lockHeld = new Promise<void>((resolve) => {
      lockTaken = resolve;
    });

    const concurrentAdminSave = testDb.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [lockKey]);
      lockTaken();
      await lockReleased;
      await tx(TableName.ExternalGroupOrgRoleMapping).where({ orgId, groupName: "g-admin" }).del();
    });
    await lockHeld;

    const editorSave = putMappings(editor.headers, [
      ["g-admin", OrgMembershipRole.Admin],
      ["g-none", OrgMembershipRole.NoAccess]
    ]).then((res) => res);

    // Wait until the editor's request has passed its checks and is queued on the write lock. The
    // lock is released either way, so a failure here fails the test instead of hanging the run.
    try {
      await waitForLockWaiter(lockKey);
    } finally {
      releaseLock();
      await concurrentAdminSave;
    }
    const res = await editorSave;

    expect(res.statusCode, res.payload).toBe(409);
    expect(await storedMappings()).toEqual([]);
  });
});
