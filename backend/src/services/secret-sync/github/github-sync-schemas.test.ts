import { GitHubSyncScope, GitHubSyncSecretType, GitHubSyncVisibility } from "./github-sync-enums";
import { CreateGitHubSyncSchema, GitHubSyncSchema } from "./github-sync-schemas";

const createConfigSchema = CreateGitHubSyncSchema.shape.destinationConfig;
const responseConfigSchema = GitHubSyncSchema.shape.destinationConfig;

describe("GitHub sync destination config secretType", () => {
  test("defaults to Actions when omitted", () => {
    const result = createConfigSchema.safeParse({ scope: GitHubSyncScope.Repository, owner: "acme", repo: "app" });

    expect(result.success && result.data.secretType).toBe(GitHubSyncSecretType.Actions);
  });

  test("fills Actions into a stored config that predates the field", () => {
    const result = responseConfigSchema.safeParse({
      scope: GitHubSyncScope.RepositoryEnvironment,
      owner: "acme",
      repo: "app",
      env: "prod"
    });

    expect(result.success && result.data.secretType).toBe(GitHubSyncSecretType.Actions);
  });

  test.each([GitHubSyncSecretType.Dependabot, GitHubSyncSecretType.Codespaces])(
    "accepts %s at repository and organization scope",
    (secretType) => {
      expect(
        createConfigSchema.safeParse({ scope: GitHubSyncScope.Repository, owner: "acme", repo: "app", secretType })
          .success
      ).toBe(true);
      expect(
        createConfigSchema.safeParse({
          scope: GitHubSyncScope.Organization,
          org: "acme",
          visibility: GitHubSyncVisibility.Selected,
          selectedRepositoryIds: [1],
          secretType
        }).success
      ).toBe(true);
    }
  );

  test.each([GitHubSyncSecretType.Dependabot, GitHubSyncSecretType.Codespaces])(
    "rejects %s at repository environment scope on the secretType field",
    (secretType) => {
      const result = createConfigSchema.safeParse({
        scope: GitHubSyncScope.RepositoryEnvironment,
        owner: "acme",
        repo: "app",
        env: "prod",
        secretType
      });

      expect(result.success).toBe(false);
      expect(!result.success && result.error.issues).toEqual([
        expect.objectContaining({
          path: ["secretType"],
          message: "Repository environment scope is only available for Actions secrets"
        })
      ]);
    }
  );

  test("rejects an unknown secret type", () => {
    expect(
      createConfigSchema.safeParse({
        scope: GitHubSyncScope.Repository,
        owner: "acme",
        repo: "app",
        secretType: "user"
      }).success
    ).toBe(false);
  });
});
