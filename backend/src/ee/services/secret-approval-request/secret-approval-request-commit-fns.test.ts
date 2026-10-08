import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { Knex } from "knex";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { conditionsMatcher } from "@app/lib/casl";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { SecretOperations } from "@app/services/secret/secret-types";
import { SecretUpdateMode } from "@app/services/secret-v2-bridge/secret-v2-bridge-types";

import {
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "../permission/project-permission";
import { scanSecretPolicyViolations } from "../secret-scanning-v2/secret-scanning-v2-fns";
import { pickApprovalCommitColumns, secretApprovalRequestCommitFnsFactory } from "./secret-approval-request-commit-fns";

vi.mock("../secret-scanning-v2/secret-scanning-v2-fns", () => ({
  scanSecretPolicyViolations: vi.fn().mockResolvedValue(undefined)
}));

const TX = { isTx: true } as unknown as Knex;
const FOLDER = { id: "folder-1", envId: "env-1" };
const PROJECT = { id: "project-1", name: "Project", orgId: "org-1", secretDetectionIgnoreValues: [] };

const allowSecrets = (...actions: ProjectPermissionSecretActions[]) =>
  createMongoAbility<ProjectPermissionSet>(
    actions.map((action) => ({ action, subject: ProjectPermissionSub.Secrets })),
    { conditionsMatcher }
  );
const allowAll = allowSecrets(
  ProjectPermissionSecretActions.Create,
  ProjectPermissionSecretActions.Edit,
  ProjectPermissionSecretActions.Delete,
  ProjectPermissionSecretActions.DescribeSecret
);

type TStoredSecret = {
  id: string;
  key: string;
  version: number;
  tags?: { id: string; slug: string }[];
  secretMetadata?: unknown[];
};

const buildFns = ({
  permission = allowAll,
  enforcement = {} as Record<string, boolean>,
  stored = [] as TStoredSecret[],
  tags = [] as { id: string; slug: string }[]
} = {}) => {
  const encryptor = vi.fn(({ plainText }: { plainText: Buffer }) => ({
    cipherTextBlob: Buffer.from(`enc:${plainText.toString()}`)
  }));
  const findBySecretKeys = vi.fn((_folderId: string, keys: { key: string }[]) =>
    Promise.resolve(stored.filter((secret) => keys.some((el) => el.key === secret.key)))
  );
  const deps = {
    permissionService: {
      getProjectPermission: vi.fn().mockResolvedValue({
        permission,
        hasProjectEnforcement: (flag: string) => Boolean(enforcement[flag])
      })
    },
    folderDAL: { findBySecretPath: vi.fn().mockResolvedValue(FOLDER) },
    projectDAL: { findById: vi.fn().mockResolvedValue(PROJECT) },
    kmsService: { createCipherPairWithDataKey: vi.fn().mockResolvedValue({ encryptor }) },
    secretV2BridgeDAL: {
      findBySecretKeys,
      find: vi.fn(() => Promise.resolve(stored))
    },
    secretVersionV2BridgeDAL: {
      findLatestVersionMany: vi.fn((_folderId: string, ids: string[]) =>
        Promise.resolve(
          Object.fromEntries(
            ids.map((id) => [
              id,
              {
                id: `version-${id}`,
                secretId: id,
                key: stored.find((s) => s.id === id)?.key,
                metadata: { x: 1 },
                version: 3
              }
            ])
          )
        )
      )
    },
    secretTagDAL: { findManyTagsById: vi.fn().mockResolvedValue(tags) },
    secretValidationRuleService: { validateSecrets: vi.fn().mockResolvedValue(undefined) }
  };
  const fns = secretApprovalRequestCommitFnsFactory(
    deps as unknown as Parameters<typeof secretApprovalRequestCommitFnsFactory>[0]
  );
  return { fns, deps, encryptor };
};

type TBuildInput = Parameters<ReturnType<typeof buildFns>["fns"]["buildSecretApprovalCommits"]>[0];
const input = (overrides: Partial<TBuildInput> = {}): TBuildInput =>
  ({
    actor: ActorType.USER,
    actorId: "user-1",
    actorOrgId: "org-1",
    actorAuthMethod: null,
    projectId: "project-1",
    environment: "dev",
    secretPath: "/",
    data: {},
    ...overrides
  }) as TBuildInput;

describe("buildSecretApprovalCommits", () => {
  beforeEach(() => {
    vi.mocked(scanSecretPolicyViolations).mockClear();
  });

  test("rejects service tokens before touching the database", async () => {
    const { fns, deps } = buildFns();

    await expect(fns.buildSecretApprovalCommits(input({ actor: ActorType.SERVICE }))).rejects.toBeInstanceOf(
      BadRequestError
    );
    expect(deps.permissionService.getProjectPermission).not.toHaveBeenCalled();
  });

  test("resolves the folder from the path unless one is provided", async () => {
    const { fns, deps } = buildFns();
    deps.folderDAL.findBySecretPath.mockResolvedValueOnce(undefined);

    await expect(
      fns.buildSecretApprovalCommits(
        input({ data: { [SecretOperations.Create]: [{ secretKey: "A", secretValue: "1" }] } })
      )
    ).rejects.toBeInstanceOf(NotFoundError);

    const bundle = await fns.buildSecretApprovalCommits(
      input({ folder: FOLDER, data: { [SecretOperations.Create]: [{ secretKey: "A", secretValue: "1" }] } })
    );
    expect(deps.folderDAL.findBySecretPath).toHaveBeenCalledTimes(1);
    expect(bundle.folderId).toBe("folder-1");
  });

  test("builds create commits with encrypted values, records tags and dedupes secret keys", async () => {
    const tags = [{ id: "tag-1", slug: "team" }];
    const { fns, deps, encryptor } = buildFns({ tags });

    const bundle = await fns.buildSecretApprovalCommits(
      input({
        data: {
          [SecretOperations.Create]: [
            { secretKey: "A", secretValue: "one", secretComment: "c", tagIds: ["tag-1"] },
            { secretKey: "B", secretValue: "two" }
          ],
          [SecretOperations.Delete]: []
        }
      })
    );

    expect(bundle.commits).toHaveLength(2);
    expect(bundle.commits[0]).toMatchObject({ op: SecretOperations.Create, version: 1, key: "A" });
    expect(bundle.commits[0].encryptedValue?.toString()).toBe("enc:one");
    expect(bundle.commits[0].encryptedComment?.toString()).toBe("enc:c");
    expect(encryptor).toHaveBeenCalled();
    expect(bundle.commitTagIds).toEqual({ A: ["tag-1"] });
    expect(bundle.tagIds).toEqual(["tag-1"]);
    expect(bundle.secretKeys).toEqual(["A", "B"]);
    expect(bundle.project).toBe(PROJECT);
    expect(deps.secretValidationRuleService.validateSecrets).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        envId: "env-1",
        secrets: [
          { key: "A", value: "one" },
          { key: "B", value: "two" }
        ]
      }),
      undefined
    );
    expect(scanSecretPolicyViolations).toHaveBeenCalledTimes(1);
  });

  test("threads the caller's transaction into every read and skips secret scanning", async () => {
    const stored = [{ id: "secret-1", key: "A", version: 2, tags: [{ id: "tag-9", slug: "old" }] }];
    const { fns, deps } = buildFns({ stored, tags: [{ id: "tag-9", slug: "old" }] });

    await fns.buildSecretApprovalCommits(
      input({
        trx: TX,
        data: {
          [SecretOperations.Update]: [{ secretKey: "A", secretValue: "new" }],
          [SecretOperations.Delete]: [{ secretKey: "A" }]
        }
      })
    );

    expect(scanSecretPolicyViolations).not.toHaveBeenCalled();
    expect(deps.folderDAL.findBySecretPath).toHaveBeenCalledWith("project-1", "dev", "/", TX);
    expect(deps.kmsService.createCipherPairWithDataKey).toHaveBeenCalledWith(expect.anything(), TX);
    expect(deps.projectDAL.findById).toHaveBeenCalledWith("project-1", TX);
    expect(deps.secretV2BridgeDAL.findBySecretKeys).toHaveBeenCalledWith("folder-1", expect.anything(), TX);
    expect(deps.secretV2BridgeDAL.find).toHaveBeenCalledWith(expect.anything(), { tx: TX });
    expect(deps.secretVersionV2BridgeDAL.findLatestVersionMany).toHaveBeenCalledWith("folder-1", ["secret-1"], TX);
    expect(deps.secretTagDAL.findManyTagsById).toHaveBeenCalledWith("project-1", ["tag-9"], TX);
    expect(deps.secretValidationRuleService.validateSecrets).toHaveBeenCalledWith(expect.anything(), TX);
  });

  test("rejects a create whose key already exists", async () => {
    const { fns } = buildFns({ stored: [{ id: "secret-1", key: "A", version: 1 }] });

    await expect(
      fns.buildSecretApprovalCommits(
        input({ data: { [SecretOperations.Create]: [{ secretKey: "A", secretValue: "1" }] } })
      )
    ).rejects.toThrow("Secret already exists: 'A'");
  });

  test("builds update commits from the latest version, keeping existing tags, and fails on a missing key by default", async () => {
    const stored = [{ id: "secret-1", key: "A", version: 2, tags: [{ id: "tag-9", slug: "old" }] }];
    const { fns } = buildFns({ stored, tags: [{ id: "tag-9", slug: "old" }] });

    const bundle = await fns.buildSecretApprovalCommits(
      input({ data: { [SecretOperations.Update]: [{ secretKey: "A", secretValue: "new", newSecretName: "A2" }] } })
    );
    expect(bundle.commits[0]).toMatchObject({
      op: SecretOperations.Update,
      key: "A2",
      secretId: "secret-1",
      secretVersion: "version-secret-1",
      version: 2
    });
    expect(bundle.commits[0]).not.toHaveProperty("metadata");
    expect(bundle.commitTagIds).toEqual({ A2: ["tag-9"] });

    await expect(
      fns.buildSecretApprovalCommits(input({ data: { [SecretOperations.Update]: [{ secretKey: "MISSING" }] } }))
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  test("names the secrets missing from a rename, not the ones that were found", async () => {
    const stored = [
      { id: "secret-1", key: "KEEP", version: 1 },
      { id: "secret-2", key: "GONE", version: 1 }
    ];
    const { fns, deps } = buildFns({ stored });
    deps.secretV2BridgeDAL.findBySecretKeys.mockResolvedValueOnce(stored).mockResolvedValueOnce([stored[0]]);

    await expect(
      fns.buildSecretApprovalCommits(
        input({
          data: {
            [SecretOperations.Update]: [
              { secretKey: "KEEP", newSecretName: "KEEP2" },
              { secretKey: "GONE", newSecretName: "GONE2" }
            ]
          }
        })
      )
    ).rejects.toEqual(expect.objectContaining({ name: "NotFound", message: "Secret does not exist: GONE" }));
  });

  test("upsert turns missing updates into creates without duplicating a key already being created", async () => {
    const { fns } = buildFns();

    const bundle = await fns.buildSecretApprovalCommits(
      input({
        updateMode: SecretUpdateMode.Upsert,
        data: {
          [SecretOperations.Create]: [{ secretKey: "A", secretValue: "1" }],
          [SecretOperations.Update]: [
            { secretKey: "A", secretValue: "2" },
            { secretKey: "B", secretValue: "3" },
            { secretKey: "B", secretValue: "4" }
          ]
        }
      })
    );

    expect(bundle.commits.map((commit) => [commit.op, commit.key])).toEqual([
      [SecretOperations.Create, "A"],
      [SecretOperations.Create, "B"]
    ]);
  });

  test("ignore mode drops missing updates and reports empty commits", async () => {
    const { fns } = buildFns();

    await expect(
      fns.buildSecretApprovalCommits(
        input({ updateMode: SecretUpdateMode.Ignore, data: { [SecretOperations.Update]: [{ secretKey: "MISSING" }] } })
      )
    ).rejects.toThrow("Empty commits");
  });

  test("builds delete commits and refuses when the actor may not delete", async () => {
    const stored = [
      { id: "secret-1", key: "A", version: 1, tags: [{ id: "tag-1", slug: "team" }], secretMetadata: [] }
    ];
    const { fns } = buildFns({ stored, tags: [{ id: "tag-1", slug: "team" }] });

    const bundle = await fns.buildSecretApprovalCommits(
      input({ data: { [SecretOperations.Delete]: [{ secretKey: "A" }] } })
    );
    expect(bundle.commits[0]).toMatchObject({
      op: SecretOperations.Delete,
      key: "A",
      secretId: "secret-1",
      secretVersion: "version-secret-1"
    });

    const denied = buildFns({ stored, permission: allowSecrets(ProjectPermissionSecretActions.Create) });
    await expect(
      denied.fns.buildSecretApprovalCommits(input({ data: { [SecretOperations.Delete]: [{ secretKey: "A" }] } }))
    ).rejects.toBeInstanceOf(ForbiddenError);

    const missing = buildFns();
    await expect(
      missing.fns.buildSecretApprovalCommits(input({ data: { [SecretOperations.Delete]: [{ secretKey: "A" }] } }))
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  test("rejects unknown tags and actors without create permission", async () => {
    const { fns } = buildFns({ tags: [] });
    await expect(
      fns.buildSecretApprovalCommits(
        input({ data: { [SecretOperations.Create]: [{ secretKey: "A", secretValue: "1", tagIds: ["tag-x"] }] } })
      )
    ).rejects.toThrow("Tag not found");

    const denied = buildFns({ permission: allowSecrets(ProjectPermissionSecretActions.Delete) });
    await expect(
      denied.fns.buildSecretApprovalCommits(
        input({ data: { [SecretOperations.Create]: [{ secretKey: "A", secretValue: "1" }] } })
      )
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  test("rejects plaintext metadata when the project enforces encrypted metadata", async () => {
    const { fns } = buildFns({ enforcement: { enforceEncryptedSecretManagerSecretMetadata: true } });

    await expect(
      fns.buildSecretApprovalCommits(
        input({
          data: {
            [SecretOperations.Create]: [
              { secretKey: "A", secretValue: "1", secretMetadata: [{ key: "k", value: "v", isEncrypted: false }] }
            ]
          }
        })
      )
    ).rejects.toThrow("Project requires all metadata to be encrypted");
  });
});

describe("pickApprovalCommitColumns", () => {
  test("keeps only the columns the commit table stores", () => {
    const picked = pickApprovalCommitColumns({
      op: SecretOperations.Update,
      key: "A",
      version: 2,
      secretId: "secret-1",
      secretVersion: "version-1",
      type: "shared",
      secret: "secret-1",
      id: "version-row"
    } as never);

    expect(Object.keys(picked).sort()).toEqual(
      [
        "encryptedComment",
        "encryptedValue",
        "key",
        "metadata",
        "op",
        "reminderNote",
        "reminderRepeatDays",
        "secretId",
        "secretMetadata",
        "secretVersion",
        "skipMultilineEncoding",
        "version"
      ].sort()
    );
    expect(picked).not.toHaveProperty("type");
    expect(picked).not.toHaveProperty("secret");
  });
});
