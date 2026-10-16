import { CloudflareWorkersVariableType } from "./cloudflare-workers/cloudflare-workers-constants";
import { areSecretSyncDestinationConfigsEqual } from "./secret-sync-duplicate-check";
import { SecretSync } from "./secret-sync-enums";
import { DESTINATION_DUPLICATE_CHECK_MAP } from "./secret-sync-maps";

describe("secret sync destination comparison", () => {
  test.each([
    [SecretSync.Bitbucket, "environmentId", { workspaceSlug: "workspace", repositorySlug: "repository" }],
    [SecretSync.TeamCity, "buildConfig", { project: "project" }],
    [
      SecretSync.Qovery,
      "environmentId",
      { organizationId: "organization", projectId: "project", variableType: "secret" }
    ]
  ] as const)("matches cleared and omitted %s scopes in both directions", (destination, field, config) => {
    for (const value of ["", null, undefined]) {
      const cleared = { ...config, [field]: value };
      expect(areSecretSyncDestinationConfigsEqual(destination, cleared, config, [])).toBe(true);
      expect(areSecretSyncDestinationConfigsEqual(destination, config, cleared, [])).toBe(true);
      expect(areSecretSyncDestinationConfigsEqual(destination, { ...config, [field]: "selected" }, config, [])).toBe(
        false
      );
      expect(cleared).toHaveProperty(field, value);
    }
  });

  test("preserves distinct selected scopes and unrelated destination fields", () => {
    expect(
      areSecretSyncDestinationConfigsEqual(
        SecretSync.TeamCity,
        { project: "project", buildConfig: "build-a" },
        { project: "project", buildConfig: "build-b" },
        []
      )
    ).toBe(false);
    expect(
      areSecretSyncDestinationConfigsEqual(
        SecretSync.Bitbucket,
        { workspaceSlug: "a", repositorySlug: "repo", environmentId: "" },
        { workspaceSlug: "b", repositorySlug: "repo" },
        []
      )
    ).toBe(false);
  });

  test("still ignores display-only fields", () => {
    expect(
      areSecretSyncDestinationConfigsEqual(
        SecretSync.Qovery,
        { projectId: "project", environmentId: "", environmentName: "Old label" },
        { projectId: "project" },
        ["environmentName"]
      )
    ).toBe(true);
  });

  test("does not strip empty values in other providers", () => {
    expect(
      areSecretSyncDestinationConfigsEqual(
        SecretSync.Vercel,
        { scope: "project", teamId: "", sensitive: false, targetProjects: [] },
        { scope: "project", sensitive: false, targetProjects: [] },
        []
      )
    ).toBe(false);
  });
});

describe("Cloudflare Workers duplicate check", () => {
  const workersSync = (variableType?: CloudflareWorkersVariableType, syncNonSecretBindings?: boolean) => ({
    connectionId: null,
    destinationConfig: { scriptId: "worker", variableType },
    syncOptions: { syncNonSecretBindings }
  });

  test.each([
    [
      "a Secret and a Text sync",
      workersSync(CloudflareWorkersVariableType.Secret),
      workersSync(CloudflareWorkersVariableType.Text),
      false
    ],
    [
      "two Text syncs",
      workersSync(CloudflareWorkersVariableType.Text),
      workersSync(CloudflareWorkersVariableType.Text),
      true
    ],
    [
      "a sync saved without a type and a Secret sync",
      workersSync(),
      workersSync(CloudflareWorkersVariableType.Secret),
      true
    ],
    [
      "a Secret sync that also syncs plaintext and JSON variables and a Text sync",
      workersSync(CloudflareWorkersVariableType.Secret, true),
      workersSync(CloudflareWorkersVariableType.Text),
      true
    ],
    [
      "a JSON sync and a sync saved without a type that also syncs plaintext and JSON variables",
      workersSync(CloudflareWorkersVariableType.Json),
      workersSync(undefined, true),
      true
    ]
  ])("%s: duplicate is %s", async (_, existingSync, newSync, isDuplicate) => {
    await expect(
      DESTINATION_DUPLICATE_CHECK_MAP[SecretSync.CloudflareWorkers]({
        existingSync,
        newSync,
        decryptConnection: vi.fn()
      })
    ).resolves.toBe(isDuplicate);
  });
});
