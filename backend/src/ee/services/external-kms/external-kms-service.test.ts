import { createMongoAbility } from "@casl/ability";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ConflictError } from "@app/lib/errors";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { externalKmsServiceFactory } from "./external-kms-service";
import { ExternalKmsProviderInputsVersion, KmsAwsCredentialType, KmsProviders } from "./providers/model";

vi.mock("./providers/aws-kms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./providers/aws-kms")>();
  return {
    ...actual,
    AwsKmsProviderFactory: vi.fn(async ({ inputs }: { inputs: unknown }) => ({
      validateConnection: async () => true,
      getProviderInputs: () => inputs,
      cleanup: async () => {}
    }))
  };
});

const ORG_ID = "8a3c2f0e-6f4b-4b0e-9a57-3f1d2c4b5a60";
const KMS_ID = "5b9d6c1a-3e2f-4a7b-8c9d-0e1f2a3b4c5d";
const EXTERNAL_KMS_ID = "7c8d9e0f-1a2b-4c3d-9e4f-5a6b7c8d9e0f";

const storedInputs = {
  credential: {
    type: KmsAwsCredentialType.AssumeRole,
    data: { assumeRoleArn: "arn:aws:iam::123456789012:role/kms", externalId: "customer-chosen-123" }
  },
  awsRegion: "us-east-1",
  kmsKeyId: "key-1"
};
const storedBlob = Buffer.from(JSON.stringify(storedInputs));

const externalKmsDAL = {
  findOne: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({}))
};

const service = externalKmsServiceFactory({
  externalKmsDAL: externalKmsDAL as never,
  kmsDAL: {
    findById: vi.fn().mockResolvedValue({ id: KMS_ID, orgId: ORG_ID }),
    updateById: vi.fn()
  } as never,
  kmsService: {
    createCipherPairWithDataKey: vi.fn().mockResolvedValue({
      encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText }),
      decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob
    })
  } as never,
  permissionService: {
    getOrgPermission: vi
      .fn()
      .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) })
  } as never,
  licenseService: { getPlan: vi.fn().mockResolvedValue({ has: () => true }) } as never,
  orgDAL: { findById: vi.fn() },
  projectDAL: { findById: vi.fn() }
});

const updateRegion = () =>
  service.updateById({
    id: KMS_ID,
    provider: { type: KmsProviders.Aws, inputs: { awsRegion: "us-west-2" } },
    actor: ActorType.USER,
    actorId: "user-1",
    actorOrgId: ORG_ID,
    actorAuthMethod: AuthMethod.EMAIL
  });

describe("externalKmsService.updateById", () => {
  beforeEach(() => {
    externalKmsDAL.findOne.mockResolvedValue({
      id: EXTERNAL_KMS_ID,
      encryptedProviderInputs: storedBlob,
      providerInputsVersion: ExternalKmsProviderInputsVersion.Legacy
    });
    externalKmsDAL.update.mockReset();
  });

  test("writes only if the stored inputs and version are still the ones it read", async () => {
    externalKmsDAL.update.mockResolvedValue([{ id: EXTERNAL_KMS_ID }]);

    await updateRegion();

    const [filter, data] = externalKmsDAL.update.mock.calls[0] as [
      Record<string, unknown>,
      { encryptedProviderInputs: Buffer; providerInputsVersion: number }
    ];
    expect(filter).toEqual({
      id: EXTERNAL_KMS_ID,
      encryptedProviderInputs: storedBlob,
      providerInputsVersion: ExternalKmsProviderInputsVersion.Legacy
    });
    expect(data.providerInputsVersion).toBe(ExternalKmsProviderInputsVersion.Legacy);
    const written = JSON.parse(data.encryptedProviderInputs.toString()) as { awsRegion: string };
    expect(written.awsRegion).toBe("us-west-2");
  });

  test("refuses with a conflict when another update changed the row in the meantime", async () => {
    externalKmsDAL.update.mockResolvedValue([]);

    await expect(updateRegion()).rejects.toBeInstanceOf(ConflictError);
  });
});
