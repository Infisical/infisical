import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { createSecretV2 } from "e2e-test/testUtils/secrets";

import { SecretType, TableName } from "@app/db/schemas";

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

    const res = await enable(authToken);
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/already enabled/i);
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

    // Progress counters live in the run's Redis key, which the final chunk deletes, so a completed
    // run reports zeros rather than its final totals. That is the point of keeping completion on the
    // durable flag: there is only ever one answer to "is it done".
    await waitForCompletion(authToken);

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
