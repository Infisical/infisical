import { TableName } from "@app/db/schemas";
import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { KmsAwsCredentialType, KmsProviders } from "@app/ee/services/external-kms/providers/model";

import { KmsCoreModule, KmsDataKey, KmsType } from "../../ce/module";
import { testKmsCoreEnv } from "../../ce/testing/build-kms-core";
import { KmsCoreEeModule } from "../module";
import { FakeExternalKmsProviders } from "../testing/fake-external-kms-providers";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const awsInputs = {
  type: KmsProviders.Aws,
  inputs: {
    credential: { type: KmsAwsCredentialType.AccessKey, data: { accessKey: "AKIA", secretKey: "secret" } },
    awsRegion: "us-east-1",
    kmsKeyId: "arn:aws:kms:us-east-1:000000000000:key/fake"
  }
};

describe("External KMS keys on Postgres", () => {
  const h = setupIntegration();

  const build = async () => {
    const fake = new FakeExternalKmsProviders();
    const hsmConfig = {
      isHsmConfigured: false,
      HSM_PIN: undefined,
      HSM_SLOT: 0,
      HSM_LIB_PATH: undefined,
      HSM_KEY_LABEL: undefined
    };
    const db = DataAccessDb.fromClient(h.db);
    const ee = new KmsCoreEeModule({ db, hsmConfig, providers: fake.providers });
    const core = new KmsCoreModule({
      db,
      env: testKmsCoreEnv(),
      hooks: ee.hooks,
      isFipsEnabled: () => false
    });
    await ee.start({ hsmEntitled: false });
    await core.start({ skipRotationState: true });
    return { fake, kms: core.service };
  };

  test("should store an external key with its provider config, encrypted with the org data key", async () => {
    // Setup
    const tn = await h.newTenant();
    const { kms } = await build();

    // Action
    const created = await kms.createExternalKms({ orgId: tn.org.id, name: "aws-key", provider: awsInputs });

    // Assert
    const stored = await h.db(TableName.ExternalKms).where({ kmsKeyId: created.id }).first();
    expect(stored?.provider).toBe(KmsProviders.Aws);
    expect(stored?.encryptedProviderInputs.toString()).not.toContain("secret");
    expect((await kms.getExternalKms(created.id)).external.providerInput).toMatchObject({ awsRegion: "us-east-1" });
  });

  test("should store nothing when the provider refuses the connection", async () => {
    // Setup
    const tn = await h.newTenant();
    const { kms, fake } = await build();
    fake.failValidation = true;

    // Action
    const result = kms.createExternalKms({ orgId: tn.org.id, name: "refused", provider: awsInputs });

    // Assert
    await expect(result).rejects.toThrow("AWS error: connection refused");
    expect(await h.db(TableName.KmsKey).where({ orgId: tn.org.id, name: "refused" }).first()).toBeUndefined();
  });

  test("should remove the external config with its key", async () => {
    // Setup
    const tn = await h.newTenant();
    const { kms } = await build();
    const created = await kms.createExternalKms({ orgId: tn.org.id, name: "short-lived", provider: awsInputs });

    // Action
    await kms.deleteExternalKms(created.id);

    // Assert
    expect(await h.db(TableName.ExternalKms).where({ kmsKeyId: created.id }).first()).toBeUndefined();
  });

  test("should keep a project's data readable after switching to an external key and back", async () => {
    // Setup
    const tn = await h.newTenant();
    const { kms } = await build();
    const external = await kms.createExternalKms({ orgId: tn.org.id, name: "project-key", provider: awsInputs });
    const cipher = await kms.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId: tn.project.id });
    const blob = cipher.encryptor({ plainText: Buffer.from("portable") }).cipherTextBlob;

    // Action
    await kms.updateProjectSecretManagerKmsKey({
      projectId: tn.project.id,
      kms: { type: KmsType.External, kmsId: external.id }
    });
    const onExternal = await kms.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: tn.project.id
    });
    await kms.updateProjectSecretManagerKmsKey({ projectId: tn.project.id, kms: { type: KmsType.Internal } });
    const backOnInternal = await kms.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: tn.project.id
    });

    // Assert
    expect(onExternal.decryptor({ cipherTextBlob: blob }).toString()).toBe("portable");
    expect(backOnInternal.decryptor({ cipherTextBlob: blob }).toString()).toBe("portable");
  });

  test("should hold no transaction open while it calls the provider", async () => {
    // Setup
    const tn = await h.newTenant();
    const { kms, fake } = await build();
    const external = await kms.createExternalKms({ orgId: tn.org.id, name: "watched", provider: awsInputs });
    const openTransactions: number[] = [];
    fake.onCall = async () => {
      const { rows } = (await h.db.raw(
        "SELECT count(*)::int AS open FROM pg_stat_activity WHERE datname = current_database() AND state LIKE 'idle in transaction%'"
      )) as { rows: { open: number }[] };
      openTransactions.push(rows[0].open);
    };

    // Action
    await kms.updateProjectSecretManagerKmsKey({
      projectId: tn.project.id,
      kms: { type: KmsType.External, kmsId: external.id }
    });
    await kms.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId: tn.project.id });

    // Assert
    expect(openTransactions.length).toBeGreaterThan(0);
    expect(openTransactions.every((open) => open === 0)).toBe(true);
  });
});
