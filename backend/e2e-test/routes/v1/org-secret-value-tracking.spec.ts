import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { createSecretV2, updateSecretV2 } from "e2e-test/testUtils/secrets";
import jwt from "jsonwebtoken";

import { AccessScope, OrgMembershipRole, OrgMembershipStatus, SecretType, TableName } from "@app/db/schemas";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";

const ENV = "dev";

type TStatus = {
  status: string;
  message?: string;
  projectsTotal: number;
  projectsDone: number;
  secretsProcessed: number;
};

const enable = (authToken: string) =>
  testServer.inject({
    method: "POST",
    url: "/api/v1/organization/secret-value-tracking",
    headers: { authorization: `Bearer ${authToken}` }
  });

const status = async (authToken: string): Promise<TStatus> => {
  const res = await testServer.inject({
    method: "GET",
    url: "/api/v1/organization/secret-value-tracking/status",
    headers: { authorization: `Bearer ${authToken}` }
  });
  expect(res.statusCode).toBe(200);
  return res.json();
};

const searchByValue = (secretValue: string, authToken: string) =>
  testServer.inject({
    method: "POST",
    url: "/api/v4/secrets/search-by-value",
    headers: { authorization: `Bearer ${authToken}` },
    body: { secretValue }
  });

// Manufactures the state a customer upgrading into this feature is actually in: secrets that were
// written before the org-scoped digest existed, and an organization that has never run the walk.
// A test organization cannot otherwise reach it, because it is created complete.
const makeOrgIncomplete = async (orgId: string) => {
  await testDb(TableName.Organization).where({ id: orgId }).update({ orgWideSecretValueTrackingEnabled: false });
  await testDb(TableName.SecretV2)
    .whereIn(
      `${TableName.SecretV2}.folderId`,
      testDb(TableName.SecretFolder)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .select(`${TableName.SecretFolder}.id`)
    )
    .update({ secretValueOrgBlindIndex: null });
};

const listCommits = async (authToken: string, projectId: string) => {
  const res = await testServer.inject({
    method: "GET",
    url: `/api/v1/pit/commits?environment=${ENV}&path=%2F&projectId=${projectId}`,
    headers: { authorization: `Bearer ${authToken}` }
  });
  expect(res.statusCode).toBe(200);
  return res.json();
};

const rollbackTo = async (authToken: string, projectId: string, commitId: string, folderId: string) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/pit/commits/${commitId}/rollback`,
    headers: { authorization: `Bearer ${authToken}` },
    body: { folderId, environment: ENV, projectId, deepRollback: false, message: "rollback under test" }
  });
  expect(res.statusCode).toBe(200);
  return res.json();
};

const waitForCompletion = async (authToken: string, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const current = await status(authToken);
    if (current.status === "completed") return current;
    if (current.status === "failed") throw new Error(`Backfill failed: ${current.message ?? "unknown"}`);
    if (Date.now() > deadline) throw new Error(`Backfill did not complete, last status ${current.status}`);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }
};

describe("Org-wide secret value tracking", () => {
  // The walk is a queue round trip per chunk, so it takes longer than the 5s default.
  vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

  let orgId: string;
  let projectId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ orgId, projectId, authToken, cleanup } = await createIsolatedOrgAndProject("org-value-tracking-e2e"));
  });

  afterAll(async () => {
    await cleanup();
  });

  test("an organization created after this shipped is already tracking", async () => {
    expect((await status(authToken)).status).toBe("completed");
  });

  // Re-running a completed backfill is the repair path for every way an unindexed row can get back
  // into a finished org, so it has to be accepted rather than refused as "already enabled".
  test("a completed organization can run the backfill again", async () => {
    expect((await enable(authToken)).statusCode).toBe(200);
    await waitForCompletion(authToken);
    expect((await status(authToken)).status).toBe("completed");
  });

  test("searching by value refuses while tracking is off, and works once the backfill completes", async () => {
    await createSecretV2({
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/",
      key: "PREDATES_TRACKING",
      value: "written-before-tracking",
      authToken
    });

    await makeOrgIncomplete(orgId);

    const refused = await searchByValue("written-before-tracking", authToken);
    expect(refused.statusCode).toBe(400);
    expect(refused.json().message).toMatch(/org-wide secret value tracking/i);

    expect((await status(authToken)).status).toBe("not-found");

    const started = await enable(authToken);
    expect(started.statusCode).toBe(200);

    const finished = await waitForCompletion(authToken);
    expect(finished.projectsTotal).toBeGreaterThanOrEqual(1);
    expect(finished.projectsDone).toBeGreaterThanOrEqual(1);

    const found = await searchByValue("written-before-tracking", authToken);
    expect(found.statusCode).toBe(200);
    expect(found.json().secrets.map((s: { key: string }) => s.key)).toEqual(["PREDATES_TRACKING"]);
  });

  // The (key, id) cursor exists for this: the unique index on (key, folderId) is partial on
  // type = 'shared', so a personal override shares a key with the shared secret in its folder and a
  // key-only cursor would walk past one of them.
  test("a personal override sharing a key with a shared secret is backfilled too", async () => {
    await createSecretV2({
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/",
      key: "SHARED_AND_PERSONAL",
      value: "the-shared-value",
      authToken
    });
    await createSecretV2({
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/",
      key: "SHARED_AND_PERSONAL",
      value: "the-personal-value",
      type: SecretType.Personal,
      authToken
    });

    await makeOrgIncomplete(orgId);
    expect((await enable(authToken)).statusCode).toBe(200);
    await waitForCompletion(authToken);

    const rows = await testDb(TableName.SecretV2)
      .where({ key: "SHARED_AND_PERSONAL" })
      .select("id", "type", "secretValueOrgBlindIndex");

    expect(rows).toHaveLength(2);
    rows.forEach((row) => expect(row.secretValueOrgBlindIndex).toEqual(expect.any(String)));
    // Two different values must not collide on one digest.
    expect(new Set(rows.map((row) => row.secretValueOrgBlindIndex)).size).toBe(2);
  });

  // Version rows written before the org digest existed carry none, and a rollback copies a version's
  // digests straight onto the live secret. Without repair that silently puts an unindexed row back
  // into a project the org has already been told is fully searchable.
  test("rolling back to a version written before the org digest existed still leaves the secret findable", async () => {
    const value = `rolled-back-${Date.now()}`;

    await createSecretV2({
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/",
      key: "ROLLED_BACK",
      value,
      authToken
    });
    const { commits } = await listCommits(authToken, projectId);
    const target = commits[0];

    await updateSecretV2({
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/",
      key: "ROLLED_BACK",
      value: "some-other-value",
      authToken
    });

    // Every version row predating the migration looks like this.
    await testDb(TableName.SecretVersionV2).update({ secretValueOrgBlindIndex: null });

    await rollbackTo(authToken, projectId, target.id, target.folderId);

    const found = await searchByValue(value, authToken);
    expect(found.statusCode).toBe(200);
    expect(found.json().secrets.map((s: { key: string }) => s.key)).toEqual(["ROLLED_BACK"]);
  });

  // The security-critical branch: the search reports WHERE a value is used, so a hit in a project the
  // caller cannot read must never reach them, even inside their own organization.
  test("a member who cannot read a project does not see its hits", async () => {
    const shared = `cross-project-${Date.now()}`;

    const secondProjectRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { authorization: `Bearer ${authToken}` },
      body: { projectName: `value-tracking-second-${Date.now()}` }
    });
    expect(secondProjectRes.statusCode).toBe(200);
    const secondProjectId = secondProjectRes.json().project.id as string;

    await createSecretV2({
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/",
      key: "IN_READABLE",
      value: shared,
      authToken
    });
    await createSecretV2({
      workspaceId: secondProjectId,
      environmentSlug: ENV,
      secretPath: "/",
      key: "IN_UNREADABLE",
      value: shared,
      authToken
    });

    // A member of the org with no project membership at all.
    const username = `value-tracking-outsider-${Date.now()}@example.com`;
    const [user] = await testDb(TableName.Users)
      .insert({ username, email: username, isGhost: false, isAccepted: true, authMethods: [AuthMethod.EMAIL] })
      .returning("*");
    const [orgMembership] = await testDb(TableName.Membership)
      .insert({
        scope: AccessScope.Organization,
        scopeOrgId: orgId,
        actorUserId: user.id,
        status: OrgMembershipStatus.Accepted,
        isActive: true
      })
      .returning("*");
    await testDb(TableName.MembershipRole).insert({
      membershipId: orgMembership.id,
      role: OrgMembershipRole.Member
    });
    const [tokenVersion] = await testDb(TableName.AuthTokenSession)
      .insert({
        userId: user.id,
        ip: "127.0.0.1",
        userAgent: "test",
        accessVersion: 1,
        refreshVersion: 1,
        lastUsed: new Date()
      })
      .returning("*");

    // Signed with jsonwebtoken directly rather than through the crypto wrapper: that module is a
    // singleton the spec worker has not initialised, and this only needs the same claims the test
    // environment mints for the seeded user.
    const outsiderToken = jwt.sign(
      {
        authTokenType: AuthTokenType.ACCESS_TOKEN,
        userId: user.id,
        tokenVersionId: tokenVersion.id,
        authMethod: AuthMethod.EMAIL,
        organizationId: orgId,
        accessVersion: 1
      },
      process.env.AUTH_SECRET as string,
      { expiresIn: "1h" }
    );

    const owner = await searchByValue(shared, authToken);
    expect(
      owner
        .json()
        .secrets.map((s: { key: string }) => s.key)
        .sort()
    ).toEqual(["IN_READABLE", "IN_UNREADABLE"]);

    const outsider = await searchByValue(shared, outsiderToken);
    expect(outsider.statusCode).toBe(200);
    expect(outsider.json().secrets).toEqual([]);
  });

  test("a second enable while a run is moving is refused", async () => {
    await makeOrgIncomplete(orgId);

    expect((await enable(authToken)).statusCode).toBe(200);

    const second = await enable(authToken);
    // Either the first run is still moving, so the guard refuses, or it already finished, in which
    // case the flag refuses instead. Both are a 400 and both are correct.
    expect(second.statusCode).toBe(400);
    expect(second.json().message).toMatch(/already (running|enabled)/i);

    await waitForCompletion(authToken);
  });
});
