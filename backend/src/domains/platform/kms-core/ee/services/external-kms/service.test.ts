import { KmsAwsCredentialType, KmsProviders } from "@app/ee/services/external-kms/providers/model";

import { KmsDataKey } from "../../../ce/services/data-key/service";
import { FakeKmsCore } from "../../../ce/testing/fake-kms-core";
import { FakeExternalKmsProviders } from "../../testing/fake-external-kms-providers";
import { ExternalKmsService } from "./service";

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

const setup = () => {
  const core = new FakeKmsCore();
  const fake = new FakeExternalKmsProviders();
  const service = new ExternalKmsService(
    core.memory.transactionRunner,
    core.memory.stores,
    fake.providers,
    core.kmsDataKeyService
  );
  const orgId = crypto.randomUUID();
  const openStoredInputs = async (kmsId: string) => {
    const key = await core.memory.kmsKeyStore.findById(kmsId);
    const orgCipher = await core.kmsDataKeyService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });
    const encrypted = key?.externalRef()?.encryptedProviderInputs as Buffer;
    return JSON.parse(orgCipher.decryptor({ cipherTextBlob: encrypted }).toString()) as Record<string, unknown>;
  };
  return { core, fake, service, orgId, openStoredInputs };
};

describe("ExternalKmsService", () => {
  test("should store a new key with its provider inputs encrypted under the org data key", async () => {
    // Setup
    const { service, orgId, openStoredInputs } = setup();

    // Action
    const created = await service.create({ orgId, name: "AWS Key", provider: awsInputs });

    // Assert
    expect(created).toMatchObject({ name: "aws-key", orgId, external: { provider: KmsProviders.Aws } });
    expect(await openStoredInputs(created.id)).toMatchObject({ awsRegion: "us-east-1" });
  });

  test("should store nothing when the provider refuses the connection", async () => {
    // Setup
    const { service, fake, core, orgId } = setup();
    fake.failValidation = true;

    // Action
    const result = service.create({ orgId, name: "refused", provider: awsInputs });

    // Assert
    await expect(result).rejects.toThrow("AWS error: connection refused");
    expect(await core.memory.kmsKeyStore.find({ orgId, name: "refused" })).toEqual([]);
  });

  test("should validate changed provider inputs and store them encrypted again", async () => {
    // Setup
    const { service, orgId, openStoredInputs } = setup();
    const created = await service.create({ orgId, name: "aws-key", provider: awsInputs });

    // Action
    const updated = await service.update(created.id, {
      description: "moved",
      provider: { type: KmsProviders.Aws, inputs: { awsRegion: "eu-west-1" } }
    });

    // Assert
    expect(updated).toMatchObject({ description: "moved", external: { providerInput: { awsRegion: "eu-west-1" } } });
    expect(await openStoredInputs(created.id)).toMatchObject({
      awsRegion: "eu-west-1",
      kmsKeyId: awsInputs.inputs.kmsKeyId
    });
  });

  test("should read a key by id and by name, and answer not found for an internal key", async () => {
    // Setup
    const { service, core, orgId } = setup();
    const created = await service.create({ orgId, name: "by-name", provider: awsInputs });
    const internal = await core.kmsKeyService.generateKmsKey({ orgId, name: "internal-one" });

    // Action
    const byId = await service.getById(created.id);
    const byName = await service.getByName(orgId, "by-name");
    const results = [service.getById(internal.id), service.getByName(orgId, "internal-one")];

    // Assert
    expect(byId.id).toBe(created.id);
    expect(byName.id).toBe(created.id);
    await expect(results[0]).rejects.toThrow(`External KMS with ID '${internal.id}' not found`);
    await expect(results[1]).rejects.toThrow("External KMS with name 'internal-one' not found");
  });

  test("should list only the org's external keys, and delete one with its config", async () => {
    // Setup
    const { service, core, orgId } = setup();
    const created = await service.create({ orgId, name: "listed", provider: awsInputs });
    await core.kmsKeyService.generateKmsKey({ orgId, name: "internal-one" });

    // Action
    const listed = await service.list(orgId);
    await service.delete(created.id);

    // Assert
    expect(listed.map((key) => [key.name, key.externalKms.provider])).toEqual([["listed", KmsProviders.Aws]]);
    expect(await core.memory.kmsKeyStore.findById(created.id)).toBeNull();
  });

  test("should list GCP keys through the provider", async () => {
    // Setup
    const { service } = setup();

    // Action
    const keys = await service.fetchGcpKeys({ credential: {}, gcpRegion: "us-east1" });

    // Assert
    expect(keys).toEqual({ keys: ["fake-key"] });
  });
});
