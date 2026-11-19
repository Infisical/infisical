import { randomUUID } from "node:crypto";

import { TableName, TSuperAdminInsert } from "@app/db/schemas";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { FakeKmsCore } from "@app/domains/platform/kms-core/ce/testing/fake-kms-core";

import { InstanceConfigCoreModule } from "../../module";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const h = setupIntegration({ freshDatabase: true });

const buildModule = async () => {
  await h.db(TableName.SuperAdmin).delete();
  return InstanceConfigCoreModule.create({
    db: h.db,
    keyStore: new InMemoryKeyStore(),
    kmsRootKeyService: new FakeKmsCore().kmsRootKeyService,
    processEnv: {},
    isFipsEnabled: () => false
  });
};

describe("InstanceConfigService.updateConfig", () => {
  test("should keep every change when updates to different fields run at once", async () => {
    // Setup
    const { instanceConfigService } = await buildModule();

    // Action
    await Promise.all([
      instanceConfigService.updateConfig({ authConsentContent: "consent" }),
      instanceConfigService.updateConfig({ pageFrameContent: "frame" }),
      instanceConfigService.updateConfig({ allowedSignUpDomain: "example.com" }),
      instanceConfigService.updateConfig({ allowedStorageHostnames: ["a.example.com"] }),
      instanceConfigService.updateConfig({ slackClientId: "slack-id" })
    ]);

    // Assert
    const row = await h.db(TableName.SuperAdmin).first();
    expect(row).toMatchObject({
      authConsentContent: "consent",
      pageFrameContent: "frame",
      allowedSignUpDomain: "example.com",
      allowedStorageHostnames: ["a.example.com"]
    });
    expect((await instanceConfigService.getSlackCredentials()).clientId).toBe("slack-id");
    expect(await instanceConfigService.getInstanceConfig()).toMatchObject({
      authConsentContent: "consent",
      pageFrameContent: "frame",
      allowedSignUpDomain: "example.com"
    });
  });

  test("should return the slug and sso method of a SAML default auth org", async () => {
    // Setup
    const { instanceConfigService } = await buildModule();
    const org = await h.factories.organization();
    await h.db(TableName.SamlConfig).insert({
      orgId: org.id,
      authProvider: "okta-saml",
      isActive: true,
      encryptedSamlEntryPoint: Buffer.from(randomUUID()),
      encryptedSamlIssuer: Buffer.from(randomUUID()),
      encryptedSamlCertificate: Buffer.from(randomUUID())
    });

    // Action
    const settings = await instanceConfigService.updateConfig({ defaultAuthOrgId: org.id });

    // Assert
    expect(settings).toMatchObject({
      defaultAuthOrgId: org.id,
      defaultAuthOrgSlug: org.slug,
      defaultAuthOrgAuthMethod: "saml"
    });
  });

  test("should store the overrides encrypted and resolve them", async () => {
    // Setup
    const { instanceConfigService } = await buildModule();

    // Action
    await instanceConfigService.updateConfig({ envOverrides: { CLIENT_ID_GITHUB_LOGIN: "from-admin" } });

    // Assert
    const row = await h.db(TableName.SuperAdmin).first();
    expect(row?.encryptedEnvOverrides?.toString()).not.toContain("from-admin");
    expect((await instanceConfigService.getInstanceConfig()).CLIENT_ID_GITHUB_LOGIN).toBe("from-admin");
  });
});

describe("InstanceConfigCoreModule.create", () => {
  test("should leave one row when two pods boot at once", async () => {
    // Setup
    await h.db(TableName.SuperAdmin).delete();
    const deps = () => ({
      db: h.db,
      keyStore: new InMemoryKeyStore(),
      kmsRootKeyService: new FakeKmsCore().kmsRootKeyService,
      processEnv: {},
      isFipsEnabled: () => false
    });

    // Action
    await Promise.all([InstanceConfigCoreModule.create(deps()), InstanceConfigCoreModule.create(deps())]);

    // Assert
    expect(await h.db(TableName.SuperAdmin)).toHaveLength(1);
  });
});

describe("InstanceConfigCoreModule.create", () => {
  test("should serve an upgraded instance's old row settings and credentials unchanged", async () => {
    // Setup
    await h.db(TableName.SuperAdmin).delete();
    const kmsCore = new FakeKmsCore();
    const encrypt = kmsCore.kmsRootKeyService.encryptWithRootKey();
    const oldRow: TSuperAdminInsert & { id: string } = {
      id: "00000000-0000-0000-0000-000000000000",
      instanceId: "11111111-1111-4111-8111-111111111111",
      initialized: true,
      allowSignUp: false,
      adminIdentityIds: ["identity-1"],
      encryptedSlackClientId: encrypt(Buffer.from("old-slack-id")),
      encryptedSlackClientSecret: encrypt(Buffer.from("old-slack-secret")),
      encryptedEnvOverrides: encrypt(Buffer.from(JSON.stringify({ CLIENT_ID_GITHUB_LOGIN: "old-override" })))
    };
    await h.db(TableName.SuperAdmin).insert(oldRow);

    // Action
    const { instanceConfigService } = await InstanceConfigCoreModule.create({
      db: h.db,
      keyStore: new InMemoryKeyStore(),
      kmsRootKeyService: kmsCore.kmsRootKeyService,
      processEnv: {},
      isFipsEnabled: () => false
    });

    // Assert
    expect(await h.db(TableName.SuperAdmin)).toHaveLength(1);
    expect(await instanceConfigService.getInstanceConfig()).toMatchObject({
      instanceId: "11111111-1111-4111-8111-111111111111",
      initialized: true,
      allowSignUp: false,
      CLIENT_ID_GITHUB_LOGIN: "old-override"
    });
    expect((await instanceConfigService.getSlackCredentials()).toJSON()).toEqual({
      clientId: "old-slack-id",
      clientSecret: "old-slack-secret"
    });
    expect(await instanceConfigService.isInstanceAdminIdentity("identity-1")).toBe(true);
  });
});

describe("InstanceConfigCoreModule.create", () => {
  test("should leave one row that every pod serves when five pods boot at once", async () => {
    // Setup
    await h.db(TableName.SuperAdmin).delete();
    const keyStore = new InMemoryKeyStore();
    const kmsCore = new FakeKmsCore();
    const deps = () => ({
      db: h.db,
      keyStore,
      kmsRootKeyService: kmsCore.kmsRootKeyService,
      processEnv: {},
      isFipsEnabled: () => false
    });

    // Action
    const modules = await Promise.all(Array.from({ length: 5 }, () => InstanceConfigCoreModule.create(deps())));

    // Assert
    const rows = await h.db(TableName.SuperAdmin);
    expect(rows).toHaveLength(1);
    const served = await Promise.all(modules.map((m) => m.instanceConfigService.getInstanceConfig()));
    expect(new Set(served.map((config) => config.instanceId))).toEqual(new Set([rows[0].instanceId]));
  });
});
