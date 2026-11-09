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

describe("EnvOverridesService.validateOverrides", () => {
  test("should accept overrides with keys that cannot be overridden, and never apply those keys", async () => {
    // Setup
    const built = await initialized();

    // Action
    await built.config.updateConfig({ envOverrides: { CLIENT_ID_GOOGLE_LOGIN: "id", AUTH_SECRET: "nope" } });

    // Assert
    expect(built.env.effective).toEqual({ CLIENT_ID_GOOGLE_LOGIN: "id" });
  });

  test("should refuse a value the env schema rejects and store nothing", async () => {
    // Setup
    const built = await initialized();
    const before = built.state.tables.row;

    // Action
    const update = built.config.updateConfig({ envOverrides: { DISABLE_PUBLIC_SECRET_SHARING: "maybe" } });

    // Assert
    await expect(update).rejects.toThrow('Key: "DISABLE_PUBLIC_SECRET_SHARING", Error: Expected');
    expect(built.state.tables.row).toBe(before);
  });
});

describe("EnvOverridesService.getEnvOverridesOrganized", () => {
  test("should group overrides by schema group and flag keys the process env sets", async () => {
    // Setup
    const env = new FakeInstanceConfigEnv({ CLIENT_SECRET_GOOGLE_LOGIN: "from-env" });
    const built = await initialized({ env });
    await built.config.updateConfig({ envOverrides: { CLIENT_ID_GOOGLE_LOGIN: "id" } });

    // Action
    const organized = await built.config.getEnvOverridesOrganized();

    // Assert
    expect(organized.google_sso).toEqual({
      name: "Google SSO",
      fields: [
        { key: "CLIENT_ID_GOOGLE_LOGIN", description: undefined, value: "id", hasEnvEntry: false },
        { key: "CLIENT_SECRET_GOOGLE_LOGIN", description: undefined, value: "", hasEnvEntry: true }
      ]
    });
  });
});

describe("InstanceConfigCoreModule.start", () => {
  test("should apply the stored overrides now and on every refresh", async () => {
    // Setup
    const podA = await initialized();
    await podA.config.updateConfig({ envOverrides: { CLIENT_ID_GOOGLE_LOGIN: "first" } });
    const podB = buildInMemoryInstanceConfigCore({ inMemory: podA.inMemory, keyStore: podA.keyStore, kms: podA.kms });
    await podB.module.start();
    await podA.config.updateConfig({ envOverrides: { CLIENT_ID_GOOGLE_LOGIN: "second" } });

    // Action
    await podB.timers.find(({ name }) => name === "env-config-sync")?.task();

    // Assert
    expect(podB.env.effective).toEqual({ CLIENT_ID_GOOGLE_LOGIN: "second" });
  });

  test("should leave the env unchanged when the stored overrides fail to parse", async () => {
    // Setup
    const built = await initialized();
    await built.config.updateConfig({ envOverrides: { CLIENT_ID_GOOGLE_LOGIN: "id" } });
    const row = built.state.tables.row as { encryptedEnvOverrides: Buffer };
    row.encryptedEnvOverrides = built.kms.encryptWithRootKey()(
      Buffer.from(JSON.stringify({ DISABLE_PUBLIC_SECRET_SHARING: "maybe" }))
    );

    // Action
    await built.module.start();

    // Assert
    expect(built.env.effective).toEqual({ CLIENT_ID_GOOGLE_LOGIN: "id" });
  });
});
