import { RuleViolationError } from "@app/domains/lib/errors";
import {
  KmsAwsCredentialType,
  KmsProviders,
  TExternalKmsAwsSchema
} from "@app/ee/services/external-kms/providers/model";

import { DataKey } from "../../../ce/models/data-key";
import { KmsKey } from "../../../ce/models/kms-key";
import { RootKey } from "../../../ce/models/root-key";
import { KmsDataKey, KmsDataKeyService } from "../../../ce/services/data-key/service";
import { KeyCipher } from "../../../ce/services/helpers/key-cipher";
import { InMemoryKmsCoreStores } from "../../../ce/testing/in-memory-kms-core-stores";
import { ExternalKmsProviderInputsVersion } from "../../models/aws-provider-inputs";
import { FakeExternalKmsProviders } from "../../testing/fake-external-kms-providers";
import { ExternalKeyCipherService } from "./service";

const { Legacy, OrgBoundExternalId } = ExternalKmsProviderInputsVersion;

const ORG_ID = "8a3c2f0e-6f4b-4b0e-9a57-3f1d2c4b5a60";
const FOREIGN_ORG_ID = "99999999-8888-4777-8666-555555555555";
const FOREIGN_PROJECT_ID = "11111111-2222-4333-8444-555555555555";

const assumeRoleInputs = (externalId?: string): TExternalKmsAwsSchema => ({
  credential: {
    type: KmsAwsCredentialType.AssumeRole,
    data: { assumeRoleArn: "arn:aws:iam::123456789012:role/victim", externalId }
  },
  awsRegion: "us-east-1",
  kmsKeyId: "key-1"
});

const sentExternalIds = (fake: FakeExternalKmsProviders) =>
  fake.awsInputs.map((inputs) => {
    const { credential } = inputs as TExternalKmsAwsSchema;
    return credential.type === KmsAwsCredentialType.AssumeRole ? credential.data.externalId : undefined;
  });

const setup = () => {
  const memory = new InMemoryKmsCoreStores();
  memory.platformRows.addOrg(ORG_ID);
  memory.platformRows.addProject(FOREIGN_PROJECT_ID, FOREIGN_ORG_ID);
  const orgCipher = DataKey.generate().toCipherPair();
  const fake = new FakeExternalKmsProviders();
  const hook = new ExternalKeyCipherService(fake.providers);
  const externalKey = (inputs: TExternalKmsAwsSchema, providerInputsVersion: number) =>
    KmsKey.createExternal({
      orgId: ORG_ID,
      name: "aws-key",
      provider: KmsProviders.Aws,
      encryptedProviderInputs: orgCipher.encryptor({ plainText: Buffer.from(JSON.stringify(inputs)) }).cipherTextBlob,
      providerInputsVersion
    });
  return { memory, orgCipher, fake, hook, externalKey };
};

describe("ExternalKeyCipherService.encrypt", () => {
  test("should send the organization ID when current inputs have no external ID", async () => {
    // Setup
    const { orgCipher, fake, hook, externalKey } = setup();
    const ref = externalKey(assumeRoleInputs(), OrgBoundExternalId).externalRef()!;

    // Action
    await hook.encrypt(ref, orgCipher, Buffer.from("data"));

    // Assert
    expect(sentExternalIds(fake)).toEqual([ORG_ID]);
  });

  test("should never build a client for current inputs holding an external ID other than the organization ID", async () => {
    // Setup
    const { orgCipher, fake, hook, externalKey } = setup();
    const ref = externalKey(assumeRoleInputs(FOREIGN_PROJECT_ID), OrgBoundExternalId).externalRef()!;

    // Action
    const result = hook.encrypt(ref, orgCipher, Buffer.from("data"));

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
    expect(fake.awsInputs).toEqual([]);
  });

  test.each([
    ["a custom external ID", "my-custom-id"],
    ["no external ID", undefined]
  ])("should send a legacy row's %s as stored", async (_, externalId) => {
    // Setup
    const { orgCipher, fake, hook, externalKey } = setup();
    const ref = externalKey(assumeRoleInputs(externalId), Legacy).externalRef()!;

    // Action
    await hook.encrypt(ref, orgCipher, Buffer.from("data"));

    // Assert
    expect(sentExternalIds(fake)).toEqual([externalId]);
  });
});

describe("ExternalKeyCipherService.assertInputsAllowed", () => {
  test("should refuse a legacy row holding another organization's project ID", async () => {
    // Setup
    const { memory, orgCipher, hook, externalKey } = setup();
    const ref = externalKey(assumeRoleInputs(FOREIGN_PROJECT_ID), Legacy).externalRef()!;

    // Action
    const result = hook.assertInputsAllowed(ref, orgCipher, memory.stores);

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
  });

  test("should allow a legacy row holding an external ID no other organization owns", async () => {
    // Setup
    const { memory, orgCipher, hook, externalKey } = setup();
    const ref = externalKey(assumeRoleInputs("my-custom-id"), Legacy).externalRef()!;

    // Action
    const result = hook.assertInputsAllowed(ref, orgCipher, memory.stores);

    // Assert
    await expect(result).resolves.toBeUndefined();
  });
});

describe.each(["encryptor", "decryptor"] as const)("KeyCipher.%s", (method) => {
  test("should refuse a legacy row holding another organization's project ID before handing one out", async () => {
    // Setup
    const { memory, fake, hook } = setup();
    const rootKey = RootKey.generate();
    const keyCipher = new KeyCipher(memory.stores, rootKey, hook);
    const dataKeys = new KmsDataKeyService(memory.transactionRunner, memory.stores, rootKey, keyCipher);
    const orgCipher = await dataKeys.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId: ORG_ID });
    const key = KmsKey.createExternal({
      orgId: ORG_ID,
      name: "aws-key",
      provider: KmsProviders.Aws,
      encryptedProviderInputs: orgCipher.encryptor({
        plainText: Buffer.from(JSON.stringify(assumeRoleInputs(FOREIGN_PROJECT_ID)))
      }).cipherTextBlob,
      providerInputsVersion: Legacy
    });
    await memory.kmsKeyStore.insert(key);

    // Action
    const result = keyCipher[method](key);

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
    expect(fake.awsInputs).toEqual([]);
  });
});
