import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SecretSync, SecretSyncInitialSyncBehavior } from "@app/hooks/api/secretSyncs/enums";

import { getSecretSyncDestinationConfig, SecretSyncFormSchema } from "./secret-sync-schema";

const wireValue = (value: unknown) => JSON.parse(JSON.stringify(value));

const submittedConfig = (destination: SecretSync, destinationConfig: unknown) =>
  wireValue(
    SecretSyncFormSchema.parse({
      destination,
      destinationConfig,
      name: "test-sync",
      connection: { id: "00000000-0000-4000-8000-000000000001", name: "Connection" },
      environment: { id: "environment-id", name: "Development", slug: "dev" },
      secretPath: "/",
      syncOptions: { initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination },
      isAutoSyncEnabled: true
    }).destinationConfig
  );

describe("secret sync duplicate-check configuration", () => {
  const cases = [
    {
      destination: SecretSync.Netlify,
      unset: { accountId: "account-1", accountName: "Account" },
      cleared: { siteId: null, siteName: undefined, context: null }
    },
    {
      destination: SecretSync.Checkly,
      unset: { accountId: "account-1", accountName: "Account" },
      cleared: { groupId: null, groupName: undefined }
    },
    {
      destination: SecretSync.TravisCI,
      unset: { repositoryId: "repo-1", repositorySlug: "owner/repo" },
      cleared: { branch: null }
    },
    {
      destination: SecretSync.GCPSecretManager,
      unset: { scope: "global", projectId: "project-1" },
      cleared: { locationId: "" }
    }
  ];

  cases.forEach(({ destination, unset, cleared }) => {
    it(`checks the same destination after clearing optional ${destination} fields`, () => {
      const edited = { ...unset, ...cleared };
      const expected = submittedConfig(destination, unset);
      assert.deepEqual(wireValue(getSecretSyncDestinationConfig(destination, unset)), expected);
      assert.deepEqual(wireValue(getSecretSyncDestinationConfig(destination, edited)), expected);
      assert.deepEqual(submittedConfig(destination, edited), expected);
      assert.notDeepEqual(wireValue(edited), expected);
    });
  });

  it("preserves selected optional values", () => {
    const config = {
      accountId: "account-1",
      accountName: "Account",
      siteId: "site-1",
      siteName: "Site",
      context: "production"
    };
    assert.deepEqual(getSecretSyncDestinationConfig(SecretSync.Netlify, config), config);
  });

  it("applies path normalization before checking a Vault destination", () => {
    const config = { mount: " secret ", path: " /folder/path/ " };
    const expected = { mount: "secret", path: "folder/path" };
    assert.deepEqual(getSecretSyncDestinationConfig(SecretSync.HCVault, config), expected);
    assert.deepEqual(submittedConfig(SecretSync.HCVault, config), expected);
  });

  it("applies defaults and strips inactive GitLab scope fields exactly as Save does", () => {
    const config = {
      scope: "project",
      projectId: "project-1",
      projectName: "Project",
      groupId: "previous-group"
    };
    const preview = getSecretSyncDestinationConfig(SecretSync.GitLab, config);
    assert.deepEqual(preview, {
      scope: "project",
      projectId: "project-1",
      projectName: "Project",
      shouldProtectSecrets: false,
      shouldMaskSecrets: false,
      shouldHideSecrets: false
    });
    assert.deepEqual(preview, submittedConfig(SecretSync.GitLab, config));
  });

  it("preserves an empty Vercel team ID for a personal project", () => {
    const config = {
      scope: "project",
      app: "app-1",
      appName: "App",
      env: "production",
      teamId: ""
    };
    const preview = getSecretSyncDestinationConfig(SecretSync.Vercel, config);
    assert.deepEqual(preview, { ...config, sensitive: false });
    assert.deepEqual(preview, submittedConfig(SecretSync.Vercel, config));
  });

  it("preserves empty arrays and explicit false values", () => {
    const config = {
      scope: "team",
      teamId: "team-1",
      targetEnvironments: [],
      applyToAllCustomEnvironments: true,
      targetProjects: [],
      sensitive: false
    };
    assert.deepEqual(getSecretSyncDestinationConfig(SecretSync.Vercel, config), config);
  });

  it("does not check incomplete or invalid destinations", () => {
    assert.equal(getSecretSyncDestinationConfig(SecretSync.TravisCI, { branch: null }), undefined);
    assert.equal(getSecretSyncDestinationConfig(SecretSync.Netlify, undefined), undefined);
    assert.equal(
      getSecretSyncDestinationConfig(SecretSync.Netlify, {
        accountId: "a",
        accountName: "A",
        context: "invalid"
      }),
      undefined
    );
  });
});

describe("mounted optional-field resets", () => {
  it("omits empty-string Travis and Checkly selections from submitted destinations", () => {
    assert.deepEqual(
      submittedConfig(SecretSync.TravisCI, {
        repositoryId: "repo-b",
        repositorySlug: "owner/repo-b",
        branch: ""
      }),
      { repositoryId: "repo-b", repositorySlug: "owner/repo-b" }
    );
    assert.deepEqual(
      submittedConfig(SecretSync.Checkly, {
        accountId: "account-b",
        accountName: "Account B",
        groupId: ""
      }),
      { accountId: "account-b", accountName: "Account B" }
    );
  });
  it("requires a fresh GitHub repository selection after clearing the selected list", () => {
    assert.equal(
      getSecretSyncDestinationConfig(SecretSync.GitHub, {
        scope: "organization",
        org: "new-org",
        visibility: "selected",
        selectedRepositoryIds: []
      }),
      undefined
    );
  });
});
