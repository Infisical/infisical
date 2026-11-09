import { buildInMemoryInstanceConfigCore } from "../testing/build-instance-config-core";
import { FakeInstanceConfigEnv } from "../testing/fake-instance-config-env";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const initialized = async (opts: Parameters<typeof buildInMemoryInstanceConfigCore>[0] = {}) => {
  const built = buildInMemoryInstanceConfigCore(opts);
  await built.module.initialize();
  return built;
};

describe("IntegrationCredentialsService.getIntegrationCredentials", () => {
  test("should decrypt stored credentials and return empty strings for unset ones", async () => {
    // Setup
    const built = await initialized();
    await built.config.updateConfig({ slackClientId: "slack-id", microsoftTeamsBotId: "bot-id" });

    // Action
    const credentials = await built.config.getIntegrationCredentials();

    // Assert
    expect(credentials.slack).toEqual({ clientId: "slack-id", clientSecret: "" });
    expect(credentials.microsoftTeams).toEqual({ appId: "", clientSecret: "", botId: "bot-id" });
  });

  test("should decrypt again once another pod changed the credentials", async () => {
    // Setup
    const podA = await initialized();
    const podB = buildInMemoryInstanceConfigCore({ inMemory: podA.inMemory, keyStore: podA.keyStore, kms: podA.kms });
    await podA.config.updateConfig({ slackClientSecret: "old" });
    await podB.config.getIntegrationCredentials();

    // Action
    await podA.config.updateConfig({ slackClientSecret: "new" });

    // Assert
    expect((await podB.config.getIntegrationCredentials()).slack.clientSecret).toBe("new");
  });

  test("should not decrypt again while the row is unchanged", async () => {
    // Setup
    const built = await initialized();
    await built.config.updateConfig({ slackClientSecret: "secret" });
    await built.config.getIntegrationCredentials();
    const decrypt = vi.spyOn(built.kms, "decryptWithRootKey");

    // Action
    await built.config.getIntegrationCredentials();

    // Assert
    expect(decrypt).not.toHaveBeenCalled();
  });
});

describe("IntegrationCredentialsService.getSlackCredentials", () => {
  test("should fall back to the env credentials when none are stored", async () => {
    // Setup
    const env = new FakeInstanceConfigEnv({
      WORKFLOW_SLACK_CLIENT_ID: "env-id",
      WORKFLOW_SLACK_CLIENT_SECRET: "env-s"
    });
    const built = await initialized({ env });

    // Action
    const credentials = await built.config.getSlackCredentials();

    // Assert
    expect(credentials).toEqual({ clientId: "env-id", clientSecret: "env-s" });
  });

  test("should prefer the stored credentials over the env ones", async () => {
    // Setup
    const env = new FakeInstanceConfigEnv({
      WORKFLOW_SLACK_CLIENT_ID: "env-id",
      WORKFLOW_SLACK_CLIENT_SECRET: "env-s"
    });
    const built = await initialized({ env });
    await built.config.updateConfig({ slackClientId: "stored-id" });

    // Action
    const credentials = await built.config.getSlackCredentials();

    // Assert
    expect(credentials).toEqual({ clientId: "stored-id", clientSecret: "env-s" });
  });
});

describe("IntegrationCredentialsService.getMicrosoftTeamsCredentials", () => {
  test("should return the row's updatedAt with the credentials", async () => {
    // Setup
    const built = await initialized();
    await built.config.updateConfig({ microsoftTeamsAppId: "app-id" });

    // Action
    const credentials = await built.config.getMicrosoftTeamsCredentials();

    // Assert
    expect(credentials.appId).toBe("app-id");
    expect(credentials.updatedAt).toEqual(built.state.tables.row?.updatedAt);
  });
});
