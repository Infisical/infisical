import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  GitHubSyncScope,
  GitHubSyncSecretType,
  GitHubSyncVisibility
} from "@app/hooks/api/secretSyncs/types/github-sync";

import { GitHubSyncDestinationSchema } from "./github-sync-destination-schema";

const destinationConfigSchema = GitHubSyncDestinationSchema.shape.destinationConfig;

const repositoryConfig = { scope: GitHubSyncScope.Repository, owner: "acme", repo: "app" };

describe("GitHub sync destination form schema", () => {
  it("defaults the secret type to Actions", () => {
    const result = destinationConfigSchema.safeParse(repositoryConfig);

    assert.equal(result.success, true);
    assert.equal(result.data?.secretType, GitHubSyncSecretType.Actions);
  });

  it("keeps an existing repository environment sync valid when it predates the secret type", () => {
    const result = destinationConfigSchema.safeParse({
      ...repositoryConfig,
      scope: GitHubSyncScope.RepositoryEnvironment,
      env: "prod"
    });

    assert.equal(result.success, true);
    assert.equal(result.data?.secretType, GitHubSyncSecretType.Actions);
  });

  it("accepts Dependabot and Codespaces at organization scope", () => {
    [GitHubSyncSecretType.Dependabot, GitHubSyncSecretType.Codespaces].forEach((secretType) => {
      const result = destinationConfigSchema.safeParse({
        scope: GitHubSyncScope.Organization,
        org: "acme",
        visibility: GitHubSyncVisibility.All,
        secretType
      });

      assert.equal(result.success, true);
    });
  });

  it("rejects the repository environment scope for non-Actions secret types", () => {
    [GitHubSyncSecretType.Dependabot, GitHubSyncSecretType.Codespaces].forEach((secretType) => {
      const result = destinationConfigSchema.safeParse({
        ...repositoryConfig,
        scope: GitHubSyncScope.RepositoryEnvironment,
        env: "prod",
        secretType
      });

      assert.equal(result.success, false);
      assert.deepEqual(
        result.error?.issues.map(({ path }) => path.join(".")),
        ["scope"]
      );
    });
  });
});
