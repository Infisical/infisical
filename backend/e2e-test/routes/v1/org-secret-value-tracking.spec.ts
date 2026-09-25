import { packRules } from "@casl/ability/extra";
import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { createSecretV2, updateSecretV2 } from "e2e-test/testUtils/secrets";
import jwt from "jsonwebtoken";

import { AccessScope, OrgMembershipRole, OrgMembershipStatus, SecretType, TableName } from "@app/db/schemas";
import {
  OrgPermissionSecretsManagementInsightsActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
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

// A backfill is refused while one is already in flight for the same scope, so a test that drives a
// run to completion cannot share an organization with the next one: the previous job may still be
// finishing when the next enable arrives, and would swallow it. Each such test gets its own.
const withOwnOrg = async (
  name: string,
  body: (ctx: Awaited<ReturnType<typeof createIsolatedOrgAndProject>>) => Promise<void>
) => {
  const ctx = await createIsolatedOrgAndProject(name);
  try {
    await body(ctx);
  } finally {
    await ctx.cleanup();
  }
};

// An org member with no project membership. With `insightsActions` they hold a custom org role
// granting exactly those Secrets Management Insights actions; without, the built-in member role.
const createOrgMemberToken = async (
  orgId: string,
  name: string,
  insightsActions?: OrgPermissionSecretsManagementInsightsActions[]
) => {
  const username = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
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

  if (insightsActions) {
    const [role] = await testDb(TableName.Role)
      .insert({
        name: username,
        slug: `role-${user.id}`,
        orgId,
        permissions: JSON.stringify(
          packRules([{ subject: OrgPermissionSubjects.SecretsManagementInsights, action: insightsActions }] as never)
        )
      })
      .returning("*");
    await testDb(TableName.MembershipRole).insert({
      membershipId: orgMembership.id,
      role: OrgMembershipRole.Custom,
      customRoleId: role.id
    });
  } else {
    await testDb(TableName.MembershipRole).insert({
      membershipId: orgMembership.id,
      role: OrgMembershipRole.Member
    });
  }

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
  return jwt.sign(
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
  test("a completed organization can run the backfill again", async () =>
    withOwnOrg("org-value-tracking-rerun", async (ctx) => {
      expect((await enable(ctx.authToken)).statusCode).toBe(200);
      await waitForCompletion(ctx.authToken);
      expect((await status(ctx.authToken)).status).toBe("completed");
    }));

  test("searching by value refuses while tracking is off, and works once the backfill completes", async () =>
    withOwnOrg("org-value-tracking-search", async (ctx) => {
      await createSecretV2({
        workspaceId: ctx.projectId,
        environmentSlug: ENV,
        secretPath: "/",
        key: "PREDATES_TRACKING",
        value: "written-before-tracking",
        authToken: ctx.authToken
      });

      await makeOrgIncomplete(ctx.orgId);

      const refused = await searchByValue("written-before-tracking", ctx.authToken);
      expect(refused.statusCode).toBe(400);
      expect(refused.json().message).toMatch(/org-wide secret value tracking/i);

      expect((await enable(ctx.authToken)).statusCode).toBe(200);

      const finished = await waitForCompletion(ctx.authToken);
      expect(finished.projectsTotal).toBeGreaterThanOrEqual(1);
      expect(finished.projectsDone).toBeGreaterThanOrEqual(1);

      const found = await searchByValue("written-before-tracking", ctx.authToken);
      expect(found.statusCode).toBe(200);
      expect(found.json().secrets.map((secret: { key: string }) => secret.key)).toEqual(["PREDATES_TRACKING"]);
    }));

  // The (key, id) cursor exists for this: the unique index on (key, folderId) is partial on
  // type = 'shared', so a personal override shares a key with the shared secret beside it and a
  // key-only cursor would walk past one of them.
  test("a personal override sharing a key with a shared secret is backfilled too", async () =>
    withOwnOrg("org-value-tracking-personal", async (ctx) => {
      await createSecretV2({
        workspaceId: ctx.projectId,
        environmentSlug: ENV,
        secretPath: "/",
        key: "SHARED_AND_PERSONAL",
        value: "the-shared-value",
        authToken: ctx.authToken
      });
      await createSecretV2({
        workspaceId: ctx.projectId,
        environmentSlug: ENV,
        secretPath: "/",
        key: "SHARED_AND_PERSONAL",
        value: "the-personal-value",
        type: SecretType.Personal,
        authToken: ctx.authToken
      });

      await makeOrgIncomplete(ctx.orgId);
      expect((await enable(ctx.authToken)).statusCode).toBe(200);
      await waitForCompletion(ctx.authToken);

      const rows = await testDb(TableName.SecretV2)
        .where({ key: "SHARED_AND_PERSONAL" })
        .select("id", "type", "secretValueOrgBlindIndex");

      expect(rows).toHaveLength(2);
      rows.forEach((row) => expect(row.secretValueOrgBlindIndex).toEqual(expect.any(String)));
      // Two different values must not collide on one digest.
      expect(new Set(rows.map((row) => row.secretValueOrgBlindIndex)).size).toBe(2);
    }));

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
    const outsiderToken = await createOrgMemberToken(orgId, "value-tracking-outsider");

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

  test("reading insights is not enough to see or start the backfill", async () => {
    const readerToken = await createOrgMemberToken(orgId, "value-tracking-reader", [
      OrgPermissionSecretsManagementInsightsActions.Read
    ]);

    expect((await enable(readerToken)).statusCode).toBe(403);

    const statusRes = await testServer.inject({
      method: "GET",
      url: "/api/v1/organization/secret-value-tracking/status",
      headers: { authorization: `Bearer ${readerToken}` }
    });
    expect(statusRes.statusCode).toBe(403);
  });

  test("searching all secret values finds hits in projects the searcher is not a member of", async () => {
    const shared = `search-all-${Date.now()}`;

    const otherProjectRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { authorization: `Bearer ${authToken}` },
      body: { projectName: `value-tracking-search-all-${Date.now()}` }
    });
    expect(otherProjectRes.statusCode).toBe(200);
    const otherProjectId = otherProjectRes.json().project.id as string;

    await createSecretV2({
      workspaceId: otherProjectId,
      environmentSlug: ENV,
      secretPath: "/",
      key: "IN_A_PROJECT_THEY_ARE_NOT_IN",
      value: shared,
      authToken
    });

    const searcherToken = await createOrgMemberToken(orgId, "value-tracking-searcher", [
      OrgPermissionSecretsManagementInsightsActions.SearchAllSecretValues
    ]);

    const res = await searchByValue(shared, searcherToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().secrets.map((s: { key: string }) => s.key)).toEqual(["IN_A_PROJECT_THEY_ARE_NOT_IN"]);
  });

  test("a second enable while a run is moving does not start a second walk", async () =>
    withOwnOrg("org-value-tracking-double", async (ctx) => {
      await makeOrgIncomplete(ctx.orgId);

      expect((await enable(ctx.authToken)).statusCode).toBe(200);
      // Accepted rather than refused: one job id per scope means the second enable is absorbed by
      // the run already in flight instead of starting a competing one.
      expect((await enable(ctx.authToken)).statusCode).toBe(200);

      await waitForCompletion(ctx.authToken);
      expect((await status(ctx.authToken)).status).toBe("completed");
    }));
});
