import { randomUUID } from "node:crypto";

import { TableName } from "@app/db/schemas";
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

  test("should store the overrides sealed and resolve them", async () => {
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
