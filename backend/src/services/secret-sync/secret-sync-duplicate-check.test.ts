import { areSecretSyncDestinationConfigsEqual } from "./secret-sync-duplicate-check";
import { SecretSync } from "./secret-sync-enums";

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
