import { TableName, TSuperAdmin } from "@app/db/schemas";
import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { InMemoryKeyStore } from "@app/domains/lib/testing/in-memory-key-store";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { buildPostgresKmsCore } from "@app/domains/platform/kms-core/ce/testing/build-postgres-kms-core";

import { InstanceConfigCoreModule } from "../module";
import { FakeInstanceConfigEnv } from "../testing/fake-instance-config-env";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

describe("InstanceConfigCoreModule on Postgres", () => {
  // super_admin holds one row for the whole instance, so this describe gets its own database.
  const h = setupIntegration({ freshDatabase: true });

  const build = async () => {
    const kmsCore = buildPostgresKmsCore(h.db);
    await kmsCore.start({ skipRotationState: true });
    const module = new InstanceConfigCoreModule({
      db: DataAccessDb.fromClient(h.db),
      keyStore: new InMemoryKeyStore(),
      kmsCoreDomain: kmsCore.service,
      env: new FakeInstanceConfigEnv(),
      isFipsModeEnabled: () => false,
      startLocalRefresh: () => ({ stop: () => undefined })
    });
    return { module, kmsCore };
  };

  test("should create exactly one row when several pods initialize at once", async () => {
    // Setup
    await h.db(TableName.SuperAdmin).del();
    const pods = await Promise.all(Array.from({ length: 8 }, () => build()));

    // Action
    await Promise.all(pods.map((pod) => pod.module.initialize()));

    // Assert
    const rows = await h.db(TableName.SuperAdmin).select("id");
    expect(rows).toHaveLength(1);
  });

  test("should store credentials encrypted with the root key and decrypt them on read", async () => {
    // Setup
    const { module, kmsCore } = await build();
    await module.initialize();

    // Action
    await module.service.updateConfig({ slackClientId: "slack-id", microsoftTeamsBotId: "bot-id" });

    // Assert
    const row = (await h.db(TableName.SuperAdmin).first("*")) as TSuperAdmin;
    expect(row.encryptedSlackClientId?.toString()).not.toContain("slack-id");
    expect(
      kmsCore.service
        .decryptWithRootKey()(row.encryptedSlackClientId as Buffer)
        .toString()
    ).toBe("slack-id");
    const credentials = await module.service.getIntegrationCredentials();
    expect(credentials.slack.clientId).toBe("slack-id");
    expect(credentials.microsoftTeams.botId).toBe("bot-id");
  });
});
