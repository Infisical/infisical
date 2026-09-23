import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { createFolder } from "e2e-test/testUtils/folders";
import { createSecretV2, deleteSecretV2, updateSecretV2 } from "e2e-test/testUtils/secrets";

const DEV_ENV = "dev";
const PROD_ENV = "prod";

type TFoundSecret = {
  key: string;
  projectId: string;
  projectName: string;
  environment: { name: string; slug: string };
  secretPath: string;
};

const searchByValue = async (secretValue: string, authToken: string) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v1/insights/secrets/search-by-value",
    headers: { authorization: `Bearer ${authToken}` },
    body: { secretValue }
  });
  expect(res.statusCode).toBe(200);
  return res.json().secrets as TFoundSecret[];
};

const at = (secrets: TFoundSecret[]) =>
  secrets.map((s) => `${s.environment.slug}${s.secretPath}${s.key}`).sort();

describe("Finding a secret by its value across an organization", () => {
  let orgId: string;
  let projectId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ orgId, projectId, authToken, cleanup } = await createIsolatedOrgAndProject("org-secret-search-e2e"));
  });

  afterAll(async () => {
    await cleanup();
  });

  test("a value that nothing holds is not found", async () => {
    expect(await searchByValue("a-value-no-secret-holds", authToken)).toEqual([]);
  });

  test("a value is found at the one place that holds it", async () => {
    await createSecretV2({
      workspaceId: projectId,
      environmentSlug: DEV_ENV,
      secretPath: "/",
      key: "FINDABLE",
      value: "find-me-please",
      authToken
    });

    const found = await searchByValue("find-me-please", authToken);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      key: "FINDABLE",
      projectId,
      environment: { slug: DEV_ENV },
      secretPath: "/"
    });
  });

  // The question this API exists to answer: a value is believed compromised, so where else is it?
  test("a value copied across environments and folders is found in every one of them", async () => {
    await createFolder({ workspaceId: projectId, environmentSlug: DEV_ENV, secretPath: "/", name: "nested", authToken });

    const shared = "the-same-value-everywhere";
    await createSecretV2({
      workspaceId: projectId,
      environmentSlug: DEV_ENV,
      secretPath: "/",
      key: "COPY_ROOT",
      value: shared,
      authToken
    });
    await createSecretV2({
      workspaceId: projectId,
      environmentSlug: DEV_ENV,
      secretPath: "/nested",
      key: "COPY_NESTED",
      value: shared,
      authToken
    });
    await createSecretV2({
      workspaceId: projectId,
      environmentSlug: PROD_ENV,
      secretPath: "/",
      key: "COPY_PROD",
      value: shared,
      authToken
    });

    expect(at(await searchByValue(shared, authToken))).toEqual([
      `${DEV_ENV}/COPY_ROOT`,
      `${DEV_ENV}/nestedCOPY_NESTED`,
      `${PROD_ENV}/COPY_PROD`
    ]);
  });

  test("a near-miss value is not found", async () => {
    await createSecretV2({
      workspaceId: projectId,
      environmentSlug: DEV_ENV,
      secretPath: "/",
      key: "EXACT",
      value: "case-sensitive-value",
      authToken
    });

    expect(await searchByValue("Case-Sensitive-Value", authToken)).toEqual([]);
    expect(await searchByValue("case-sensitive-valu", authToken)).toEqual([]);
  });

  test("a rotated value stops being found and the new one starts", async () => {
    await createSecretV2({
      workspaceId: projectId,
      environmentSlug: DEV_ENV,
      secretPath: "/",
      key: "ROTATES",
      value: "the-old-value",
      authToken
    });
    expect(await searchByValue("the-old-value", authToken)).toHaveLength(1);

    await updateSecretV2({
      workspaceId: projectId,
      environmentSlug: DEV_ENV,
      secretPath: "/",
      key: "ROTATES",
      value: "the-new-value",
      authToken
    });

    expect(await searchByValue("the-old-value", authToken)).toEqual([]);
    expect(await searchByValue("the-new-value", authToken)).toHaveLength(1);
  });

  // A rename carries no value, so the secret must still be findable by the value it still holds.
  test("renaming a secret does not stop it being found by its value", async () => {
    await createSecretV2({
      workspaceId: projectId,
      environmentSlug: DEV_ENV,
      secretPath: "/",
      key: "BEFORE_RENAME",
      value: "survives-a-rename",
      authToken
    });

    await updateSecretV2({
      workspaceId: projectId,
      environmentSlug: DEV_ENV,
      secretPath: "/",
      key: "BEFORE_RENAME",
      newKey: "AFTER_RENAME",
      authToken
    });

    const found = await searchByValue("survives-a-rename", authToken);
    expect(found).toHaveLength(1);
    expect(found[0].key).toBe("AFTER_RENAME");
  });

  test("a deleted secret stops being found", async () => {
    await createSecretV2({
      workspaceId: projectId,
      environmentSlug: DEV_ENV,
      secretPath: "/",
      key: "TEMPORARY",
      value: "here-then-gone",
      authToken
    });
    expect(await searchByValue("here-then-gone", authToken)).toHaveLength(1);

    await deleteSecretV2({
      workspaceId: projectId,
      environmentSlug: DEV_ENV,
      secretPath: "/",
      key: "TEMPORARY",
      authToken
    });

    expect(await searchByValue("here-then-gone", authToken)).toEqual([]);
  });

  // This is the test the org-scoped index exists for. The project-scoped digest cannot match across
  // projects, so a search that found only the first project would pass every test above and still be
  // broken for the case the feature was built for.
  test("a value held in a second project of the same org is found in both", async () => {
    const shared = `across-projects-${Date.now()}`;

    const secondProjectRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { authorization: `Bearer ${authToken}` },
      body: { projectName: "org-secret-search-e2e-second" }
    });
    expect(secondProjectRes.statusCode).toBe(200);
    const secondProjectId = secondProjectRes.json().project.id as string;

    await createSecretV2({
      workspaceId: projectId,
      environmentSlug: DEV_ENV,
      secretPath: "/",
      key: "IN_FIRST_PROJECT",
      value: shared,
      authToken
    });
    await createSecretV2({
      workspaceId: secondProjectId,
      environmentSlug: DEV_ENV,
      secretPath: "/",
      key: "IN_SECOND_PROJECT",
      value: shared,
      authToken
    });

    const found = await searchByValue(shared, authToken);

    expect(found.map((f) => f.key).sort()).toEqual(["IN_FIRST_PROJECT", "IN_SECOND_PROJECT"]);
    expect(new Set(found.map((f) => f.projectId))).toEqual(new Set([projectId, secondProjectId]));
  });

  // The org digest is keyed by the org data key, so one org's values must never match another's.
  test("a value held in another organization is not found", async () => {
    const other = await createIsolatedOrgAndProject("org-secret-search-e2e-other");
    try {
      const value = "value-in-a-different-org";
      await createSecretV2({
        workspaceId: other.projectId,
        environmentSlug: DEV_ENV,
        secretPath: "/",
        key: "OTHER_ORG",
        value,
        authToken: other.authToken
      });

      expect(await searchByValue(value, other.authToken)).toHaveLength(1);
      expect(await searchByValue(value, authToken)).toEqual([]);
      expect(other.orgId).not.toBe(orgId);
    } finally {
      await other.cleanup();
    }
  });
});
