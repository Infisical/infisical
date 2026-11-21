import { RuleViolationError, StateConflictError } from "@app/domains/lib/errors";
import { KmsAwsCredentialType, KmsProviders } from "@app/ee/services/external-kms/providers/model";

import { KmsKey } from "../../../ce/models/kms-key";
import { KmsDataKey } from "../../../ce/services/data-key/service";
import { FakeKmsCore } from "../../../ce/testing/fake-kms-core";
import { ExternalKmsProviderInputsVersion } from "../../models/aws-provider-inputs";
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

const assumeRole = (externalId?: string, assumeRoleArn = "arn:aws:iam::123456789012:role/kms") => ({
  credential: { type: KmsAwsCredentialType.AssumeRole, data: { assumeRoleArn, externalId } },
  awsRegion: "us-east-1",
  kmsKeyId: "key-1"
});

const sentExternalIds = (fake: FakeExternalKmsProviders) =>
  fake.awsInputs.map(
    (inputs) => (inputs as { credential: { data: { externalId?: string } } }).credential.data.externalId
  );

// Rows saved before the external ID had to be the organization ID.
const seedLegacyKey = async (ctx: ReturnType<typeof setup>, inputs: ReturnType<typeof assumeRole>) => {
  const orgCipher = await ctx.core.kmsDataKeyService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId: ctx.orgId
  });
  const key = KmsKey.createExternal({
    orgId: ctx.orgId,
    name: "legacy",
    provider: KmsProviders.Aws,
    encryptedProviderInputs: orgCipher.encryptor({ plainText: Buffer.from(JSON.stringify(inputs)) }).cipherTextBlob,
    providerInputsVersion: ExternalKmsProviderInputsVersion.Legacy
  });
  await ctx.core.memory.kmsKeyStore.insert(key);
  return key;
};

const storedVersion = async (ctx: ReturnType<typeof setup>, kmsId: string) =>
  (await ctx.core.memory.kmsKeyStore.findById(kmsId))?.externalRef()?.providerInputsVersion;

describe("ExternalKmsService.create", () => {
  test("should bind a new key's external ID to the organization and store it on the current rules", async () => {
    // Setup
    const ctx = setup();

    // Action
    const created = await ctx.service.create({
      orgId: ctx.orgId,
      name: "aws",
      provider: { type: KmsProviders.Aws, inputs: assumeRole() }
    });

    // Assert
    expect(sentExternalIds(ctx.fake)).toEqual([ctx.orgId]);
    expect(await ctx.openStoredInputs(created.id)).toMatchObject({ credential: { data: { externalId: ctx.orgId } } });
    expect(await storedVersion(ctx, created.id)).toBe(ExternalKmsProviderInputsVersion.OrgBoundExternalId);
    expect(created.external.hasLegacyExternalId).toBe(false);
  });

  test("should refuse a new key whose external ID is not the organization ID, without calling AWS", async () => {
    // Setup
    const ctx = setup();
    const otherProjectId = crypto.randomUUID();

    // Action
    const result = ctx.service.create({
      orgId: ctx.orgId,
      name: "aws",
      provider: { type: KmsProviders.Aws, inputs: assumeRole(otherProjectId) }
    });

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
    expect(ctx.fake.awsInputs).toEqual([]);
    expect(await ctx.core.memory.kmsKeyStore.find({ orgId: ctx.orgId, name: "aws" })).toEqual([]);
  });
});

describe("ExternalKmsService.update", () => {
  test("should keep a legacy key's external ID while its credential is unchanged, and flag it", async () => {
    // Setup
    const ctx = setup();
    const key = await seedLegacyKey(ctx, assumeRole("customer-chosen-123"));

    // Action
    const updated = await ctx.service.update(key.id, {
      provider: { type: KmsProviders.Aws, inputs: { awsRegion: "us-west-2" } }
    });

    // Assert
    expect(sentExternalIds(ctx.fake)).toEqual(["customer-chosen-123"]);
    expect(await storedVersion(ctx, key.id)).toBe(ExternalKmsProviderInputsVersion.Legacy);
    expect(await ctx.openStoredInputs(key.id)).toMatchObject({ awsRegion: "us-west-2" });
    expect(updated.external.hasLegacyExternalId).toBe(true);
  });

  test("should refuse a role change on a legacy key that keeps its custom external ID, without calling AWS", async () => {
    // Setup
    const ctx = setup();
    const key = await seedLegacyKey(ctx, assumeRole("customer-chosen-123"));

    // Action
    const result = ctx.service.update(key.id, {
      provider: {
        type: KmsProviders.Aws,
        inputs: assumeRole("customer-chosen-123", "arn:aws:iam::210987654321:role/x")
      }
    });

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
    expect(ctx.fake.awsInputs).toEqual([]);
    expect(await storedVersion(ctx, key.id)).toBe(ExternalKmsProviderInputsVersion.Legacy);
  });

  test("should move a legacy key to the current rules when its role changes", async () => {
    // Setup
    const ctx = setup();
    const key = await seedLegacyKey(ctx, assumeRole("customer-chosen-123"));

    // Action
    const updated = await ctx.service.update(key.id, {
      provider: { type: KmsProviders.Aws, inputs: assumeRole(ctx.orgId, "arn:aws:iam::210987654321:role/x") }
    });

    // Assert
    expect(sentExternalIds(ctx.fake)).toEqual([ctx.orgId]);
    expect(await storedVersion(ctx, key.id)).toBe(ExternalKmsProviderInputsVersion.OrgBoundExternalId);
    expect(updated.external.hasLegacyExternalId).toBe(false);
  });

  test("should refuse to update a legacy key that sends another organization's project ID", async () => {
    // Setup
    const ctx = setup();
    const foreignProjectId = crypto.randomUUID();
    ctx.core.memory.platformRows.addProject(foreignProjectId, crypto.randomUUID());
    const key = await seedLegacyKey(ctx, assumeRole(foreignProjectId));

    // Action
    const result = ctx.service.update(key.id, {
      provider: { type: KmsProviders.Aws, inputs: { awsRegion: "us-west-2" } }
    });

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
    expect(ctx.fake.awsInputs).toEqual([]);
  });

  test("should refuse a legacy external ID that another organization's project takes while the update is checked", async () => {
    // Setup
    const ctx = setup();
    const takenMeanwhile = crypto.randomUUID();
    const key = await seedLegacyKey(ctx, assumeRole(takenMeanwhile));
    ctx.fake.onCall = async () => {
      ctx.fake.onCall = undefined;
      ctx.core.memory.platformRows.addProject(takenMeanwhile, crypto.randomUUID());
    };

    // Action
    const result = ctx.service.update(key.id, {
      provider: { type: KmsProviders.Aws, inputs: { awsRegion: "us-west-2" } }
    });

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
    expect(await ctx.openStoredInputs(key.id)).toMatchObject({ awsRegion: "us-east-1" });
  });

  test("should refuse with a conflict when the provider inputs changed while the update was being checked", async () => {
    // Setup
    const ctx = setup();
    const key = await seedLegacyKey(ctx, assumeRole("customer-chosen-123"));
    ctx.fake.onCall = async () => {
      ctx.fake.onCall = undefined;
      const current = (await ctx.core.memory.kmsKeyStore.findForUpdate(key.id)) as KmsKey;
      current.replaceProviderInputs(Buffer.from("written-meanwhile"), 2, current);
      await ctx.core.memory.kmsKeyStore.save(current);
    };

    // Action
    const result = ctx.service.update(key.id, {
      provider: { type: KmsProviders.Aws, inputs: { awsRegion: "us-west-2" } }
    });

    // Assert
    await expect(result).rejects.toBeInstanceOf(StateConflictError);
    const stored = await ctx.core.memory.kmsKeyStore.findById(key.id);
    expect(stored?.externalRef()?.encryptedProviderInputs).toEqual(Buffer.from("written-meanwhile"));
  });
});
