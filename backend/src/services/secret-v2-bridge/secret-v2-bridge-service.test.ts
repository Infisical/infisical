import { createMongoAbility, ForbiddenError, MongoAbility, RawRuleOf } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { SecretType, TableName } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionSecretActions as Actions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { secretV2BridgeServiceFactory } from "./secret-v2-bridge-service";

vi.mock("@app/lib/validator/log-safe-text", () => ({
  LOG_UNSAFE_TEXT_MESSAGE: "unsafe",
  containsLogUnsafeCharacters: () => false,
  sanitizeLogText: <T,>(value: T) => value,
  sanitizeLogPayload: <T,>(value: T) => value
}));

vi.mock("@app/lib/telemetry/metrics", () => ({
  recordSecretReadMetric: vi.fn(),
  recordSecretWriteMetric: vi.fn(),
  recordSecretOperationDuration: vi.fn(),
  recordSecretCacheAccessMetric: vi.fn(),
  recordSecretCacheWriteMetric: vi.fn(),
  SecretCacheAccessResult: { HIT: "hit", MISS: "miss" },
  SecretEtagMissReason: {}
}));

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const FOLDER_ID = "00000000-0000-4000-8000-000000000002";
const DELETED_SECRET_ID = "11111111-1111-4111-8111-111111111111";
const LIVE_SECRET_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_1_DELETED_ID = "33333333-3333-4333-8333-333333333331";
const VERSION_3_DELETED_ID = "33333333-3333-4333-8333-333333333333";
const VERSION_1_LIVE_ID = "44444444-4444-4444-8444-444444444441";

type MockSecretRow = {
  id: string;
  version: number;
  type: SecretType;
  key: string;
  encryptedValue: Buffer;
  encryptedComment: Buffer | null;
  skipMultilineEncoding: boolean;
  userId: string | null;
  folderId: string;
  createdAt: Date;
  updatedAt: Date;
  tags: { id: string; slug: string; name: string; color: string | null }[];
  secretMetadata: never[];
};

type MockVersionRow = {
  id: string;
  secretId: string;
  version: number;
  type: SecretType;
  key: string;
  encryptedValue: Buffer;
  encryptedComment: Buffer | null;
  skipMultilineEncoding: boolean;
  userId: string | null;
  folderId: string;
  createdAt: Date;
  updatedAt: Date;
  isRedacted: boolean;
  tags: { id: string; slug: string; name: string; color: string | null }[];
};

const setup = ({
  liveSecrets = [],
  versions = [],
  rules = [
    { action: Actions.DescribeSecret, subject: ProjectPermissionSub.Secrets },
    { action: Actions.ReadValue, subject: ProjectPermissionSub.Secrets }
  ]
}: {
  liveSecrets?: MockSecretRow[];
  versions?: MockVersionRow[];
  rules?: RawRuleOf<MongoAbility<ProjectPermissionSet>>[];
}) => {
  const permission = createMongoAbility<ProjectPermissionSet>(rules);
  const getProjectPermission = vi
    .fn()
    .mockResolvedValue({ permission }) as unknown as TPermissionServiceFactory["getProjectPermission"];

  const findOneWithTagsSecret = vi.fn(async (filter: Record<string, unknown>) =>
    liveSecrets.find((secret) => {
      if (filter.folderId !== undefined && secret.folderId !== filter.folderId) return false;
      if (filter.type !== undefined && secret.type !== filter.type) return false;
      const key = filter[`${TableName.SecretV2}.key`] ?? filter.key;
      if (key !== undefined && secret.key !== key) return false;
      const userId = filter[`${TableName.SecretV2}.userId`] ?? filter.userId;
      if (userId !== undefined && secret.userId !== userId) return false;
      return true;
    })
  );

  const findOneWithTagsVersion = vi.fn(async (filter: Record<string, unknown>) =>
    versions.find((ver) => {
      if (filter.secretId !== undefined && ver.secretId !== filter.secretId) return false;
      if (filter.folderId !== undefined && ver.folderId !== filter.folderId) return false;
      if (filter.version !== undefined && ver.version !== filter.version) return false;
      if (filter.type !== undefined && ver.type !== filter.type) return false;
      if (filter.userId !== undefined && ver.userId !== filter.userId) return false;
      if (filter.key !== undefined && ver.key !== filter.key) return false;
      return true;
    })
  );

  const service = secretV2BridgeServiceFactory({
    secretDAL: { findOneWithTags: findOneWithTagsSecret } as never,
    secretVersionDAL: { findOneWithTags: findOneWithTagsVersion } as never,
    folderDAL: { findBySecretPath: vi.fn().mockResolvedValue({ id: FOLDER_ID }) } as never,
    permissionService: { getProjectPermission } as never,
    kmsDataKeyService: {
      createCipherPairWithDataKey: vi.fn().mockResolvedValue({
        decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob,
        encryptor: ({ plainTextBlob }: { plainTextBlob: Buffer }) => ({ cipherTextBlob: plainTextBlob })
      })
    } as never,
    projectDAL: {} as never,
    projectEnvDAL: {} as never,
    secretTagDAL: {} as never,
    secretVersionTagDAL: {} as never,
    folderCommitService: {} as never,
    eventEmitter: {} as never,
    secretQueueService: {} as never,
    secretImportDAL: { find: vi.fn().mockResolvedValue([]) } as never,
    secretChangePolicyService: {} as never,
    secretChangeRequestService: {} as never,
    resourceMetadataDAL: {} as never,
    keyStore: {} as never,
    reminderService: {} as never,
    secretValidationRuleService: {} as never,
    projectFolderGrantDAL: {} as never,
    orgDAL: {} as never
  });

  return { service, findOneWithTagsSecret, findOneWithTagsVersion };
};

const baseDto = {
  actor: ActorType.USER,
  actorId: "00000000-0000-4000-8000-000000000009",
  actorOrgId: "00000000-0000-4000-8000-000000000010",
  actorAuthMethod: "jwt" as never,
  projectId: PROJECT_ID,
  environment: "prod",
  path: "/",
  type: SecretType.Shared,
  secretName: "KEY_X",
  viewSecretValue: true
};

describe("secretV2BridgeServiceFactory.getSecretByName", () => {
  test("returns the live secret version instead of an older deleted generation's version", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const liveSecret: MockSecretRow = {
      id: LIVE_SECRET_ID,
      version: 2,
      type: SecretType.Shared,
      key: "KEY_X",
      encryptedValue: Buffer.from("GEN2_2"),
      encryptedComment: null,
      skipMultilineEncoding: false,
      userId: null,
      folderId: FOLDER_ID,
      createdAt: now,
      updatedAt: now,
      tags: [],
      secretMetadata: []
    };

    const deletedV1: MockVersionRow = {
      id: VERSION_1_DELETED_ID,
      secretId: DELETED_SECRET_ID,
      version: 1,
      type: SecretType.Shared,
      key: "KEY_X",
      encryptedValue: Buffer.from("GEN1_1"),
      encryptedComment: null,
      skipMultilineEncoding: false,
      userId: null,
      folderId: FOLDER_ID,
      createdAt: now,
      updatedAt: now,
      isRedacted: false,
      tags: []
    };

    const deletedV3: MockVersionRow = {
      ...deletedV1,
      id: VERSION_3_DELETED_ID,
      version: 3,
      encryptedValue: Buffer.from("GEN1_3")
    };

    const liveV1: MockVersionRow = {
      ...deletedV1,
      id: VERSION_1_LIVE_ID,
      secretId: LIVE_SECRET_ID,
      encryptedValue: Buffer.from("GEN2_1")
    };

    const { service, findOneWithTagsVersion } = setup({
      liveSecrets: [liveSecret],
      // Put the deleted generation's rows first (as oldest-row DB ordering does).
      versions: [deletedV1, deletedV3, liveV1]
    });

    const result = await service.getSecretByName({ ...baseDto, version: 1 });
    expect(result.secretValue).toBe("GEN2_1");
    expect(findOneWithTagsVersion).toHaveBeenCalledWith({
      secretId: LIVE_SECRET_ID,
      version: 1
    });

    // Version 3 existed only on the deleted generation and must not be returned for the live secret.
    await expect(service.getSecretByName({ ...baseDto, version: 3 })).rejects.toThrow(NotFoundError);
  });

  test("returns NotFoundError when the key has been deleted and never recreated", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const deletedV1: MockVersionRow = {
      id: VERSION_1_DELETED_ID,
      secretId: DELETED_SECRET_ID,
      version: 1,
      type: SecretType.Shared,
      key: "KEY_X",
      encryptedValue: Buffer.from("GEN1_1"),
      encryptedComment: null,
      skipMultilineEncoding: false,
      userId: null,
      folderId: FOLDER_ID,
      createdAt: now,
      updatedAt: now,
      isRedacted: false,
      tags: []
    };

    const { service, findOneWithTagsVersion } = setup({
      liveSecrets: [],
      versions: [deletedV1]
    });

    await expect(service.getSecretByName({ ...baseDto, version: 1 })).rejects.toThrow(NotFoundError);
    expect(findOneWithTagsVersion).not.toHaveBeenCalled();
  });

  test("checks permissions against both the requested version tags and the live secret tags", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const liveSecret: MockSecretRow = {
      id: LIVE_SECRET_ID,
      version: 2,
      type: SecretType.Shared,
      key: "KEY_X",
      encryptedValue: Buffer.from("GEN2_2"),
      encryptedComment: null,
      skipMultilineEncoding: false,
      userId: null,
      folderId: FOLDER_ID,
      createdAt: now,
      updatedAt: now,
      tags: [{ id: "tag-1", slug: "restricted", name: "restricted", color: null }],
      secretMetadata: []
    };

    const liveV1: MockVersionRow = {
      id: VERSION_1_LIVE_ID,
      secretId: LIVE_SECRET_ID,
      version: 1,
      type: SecretType.Shared,
      key: "KEY_X",
      encryptedValue: Buffer.from("GEN2_1"),
      encryptedComment: null,
      skipMultilineEncoding: false,
      userId: null,
      folderId: FOLDER_ID,
      createdAt: now,
      updatedAt: now,
      isRedacted: false,
      tags: []
    };

    const { service } = setup({
      liveSecrets: [liveSecret],
      versions: [liveV1],
      rules: [
        { action: Actions.DescribeSecret, subject: ProjectPermissionSub.Secrets },
        { action: Actions.ReadValue, subject: ProjectPermissionSub.Secrets },
        {
          inverted: true,
          action: Actions.DescribeSecret,
          subject: ProjectPermissionSub.Secrets,
          conditions: { secretTags: { $in: ["restricted"] } }
        }
      ]
    });

    await expect(service.getSecretByName({ ...baseDto, version: 1 })).rejects.toThrow(ForbiddenError);
  });
});
