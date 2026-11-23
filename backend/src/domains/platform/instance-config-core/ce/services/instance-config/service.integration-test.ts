import { randomUUID } from "node:crypto";

import { TableName, TSuperAdminInsert } from "@app/db/schemas";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { sealKnexTransaction } from "@app/domains/lib/transactions";
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
    expect(await instanceConfigService.getSettings()).toMatchObject({
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
    expect((await instanceConfigService.getOverridableEnv()).CLIENT_ID_GITHUB_LOGIN).toBe("from-admin");
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
    expect(await instanceConfigService.getSettings()).toMatchObject({
      instanceId: "11111111-1111-4111-8111-111111111111",
      initialized: true,
      allowSignUp: false
    });
    expect(await instanceConfigService.getOverridableEnv()).toMatchObject({
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
    const served = await Promise.all(modules.map((m) => m.instanceConfigService.getSettings()));
    expect(new Set(served.map((config) => config.instanceId))).toEqual(new Set([rows[0].instanceId]));
  });
});

describe("InstanceConfigService.within", () => {
  test("should make a second setup at once wait for the first, then refuse it before it creates anything", async () => {
    // Setup
    const { instanceConfigService } = await buildModule();
    let releaseFirst = () => {};
    const firstHolds = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let markFirstClaimed = () => {};
    const firstClaimed = new Promise<void>((resolve) => {
      markFirstClaimed = resolve;
    });
    const setUp = (adminIdentityId: string, afterClaim: () => Promise<void>) =>
      h.db.transaction(async (trx) => {
        const instanceConfig = instanceConfigService.within(sealKnexTransaction(trx));
        await instanceConfig.claimSetup();
        await afterClaim();
        await instanceConfig.completeSetup({ closeSignUp: true, adminIdentityId });
      });

    // Action
    const first = setUp("identity-1", async () => {
      markFirstClaimed();
      await firstHolds;
    });
    await firstClaimed;
    let secondSettled = false;
    let secondCreatedAnything = false;
    const second = setUp("identity-2", async () => {
      secondCreatedAnything = true;
    }).finally(() => {
      secondSettled = true;
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    const secondWaited = !secondSettled;
    releaseFirst();
    await first;

    // Assert
    expect(secondWaited).toBe(true);
    await expect(second).rejects.toThrow("Instance has already been set up");
    expect(secondCreatedAnything).toBe(false);
    expect(await h.db(TableName.SuperAdmin).first()).toMatchObject({
      initialized: true,
      allowSignUp: false,
      adminIdentityIds: ["identity-1"]
    });
  });

  test("should leave the instance not set up when the caller's transaction rolls back", async () => {
    // Setup
    const { instanceConfigService } = await buildModule();

    // Action
    const result = h.db.transaction(async (trx) => {
      const instanceConfig = instanceConfigService.within(sealKnexTransaction(trx));
      await instanceConfig.claimSetup();
      await instanceConfig.completeSetup({ closeSignUp: true, adminIdentityId: "identity-1" });
      throw new Error("creating the first organization failed");
    });

    // Assert
    await expect(result).rejects.toThrow("creating the first organization failed");
    expect(await h.db(TableName.SuperAdmin).first()).toMatchObject({ initialized: false, adminIdentityIds: null });
    expect((await instanceConfigService.getSettings()).initialized).toBe(false);
  });
});
