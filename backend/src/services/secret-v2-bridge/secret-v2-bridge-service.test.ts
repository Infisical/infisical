import { MongoAbility, RawRuleOf } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { ProjectVersion, SecretType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import { Permission } from "@app/domains/platform/access-control/ce/module";
import {
  ProjectPermission,
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/domains/platform/projects/ce/module";
import { FolderGrants, TSecretsPermissionService } from "@app/domains/secrets-manager/secrets/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";

import { secretV2BridgeServiceFactory } from "./secret-v2-bridge-service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock("@app/ee/services/secret-scanning-v2/secret-scanning-v2-fns", () => ({
  scanSecretPolicyViolations: vi.fn()
}));

const actorOf = (): TActorContext =>
  ({
    principal: { type: ActorType.USER, id: "user-1", authMethod: "email" },
    org: { id: "org-1" }
  }) as unknown as TActorContext;

const makeReferredSecret = ({
  id,
  folderId,
  key,
  tags = []
}: {
  id: string;
  folderId: string;
  key: string;
  tags?: Array<{ id: string; slug: string; name: string; color: string }>;
}) => ({
  id,
  folderId,
  key,
  type: SecretType.Shared,
  version: 1,
  tags
});

const buildService = ({
  rules,
  envs = [
    { id: "env-dev", slug: "dev" },
    { id: "env-prod", slug: "prod" }
  ],
  folders = [
    { id: "folder-dev-root", envId: "env-dev", path: "/" },
    { id: "folder-prod-root", envId: "env-prod", path: "/" },
    { id: "folder-dev-app", envId: "env-dev", path: "/app" },
    { id: "folder-dev-restricted", envId: "env-dev", path: "/restricted" }
  ],
  referredSecrets = []
}: {
  rules: RawRuleOf<MongoAbility<ProjectPermissionSet>>[];
  envs?: Array<{ id: string; slug: string }>;
  folders?: Array<{ id: string; envId: string; path: string }>;
  referredSecrets?: ReturnType<typeof makeReferredSecret>[];
}) => {
  const permission = Object.assign(Permission.fromRules<ProjectPermissionSet>({ rules }), {
    hasProjectEnforcement: () => false
  }) as unknown as ProjectPermission;
  const getSecretsPermission = vi.fn().mockResolvedValue({
    permission,
    folderGrants: FolderGrants.none()
  }) as unknown as TSecretsPermissionService["getSecretsPermission"];

  const findEnvsBySlugs = vi
    .fn()
    .mockImplementation(async (_projectId: string, slugs: string[]) => envs.filter((env) => slugs.includes(env.slug)));

  const findByManySecretPath = vi
    .fn()
    .mockImplementation(async (queries: Array<{ envId: string; secretPath: string }>) =>
      queries.map(({ envId, secretPath }) => {
        const posixPath = secretPath.replaceAll("\\", "/");
        const normalized = posixPath === "/" ? "/" : posixPath.replace(/\/+$/, "");
        const folder = folders.find((f) => f.envId === envId && f.path === normalized);
        if (!folder) return undefined;
        const resolvedPath = secretPath === "/" ? "/" : secretPath.replace(/\/+$/, "") || "/";
        return { ...folder, path: resolvedPath };
      })
    );

  const findBySecretPath = vi
    .fn()
    .mockImplementation(async (_projectId: string, envSlug: string, secretPath: string) => {
      const env = envs.find((e) => e.slug === envSlug);
      if (!env) return undefined;
      const normalized = secretPath === "/" ? "/" : secretPath.replace(/\/+$/, "");
      const folder = folders.find((f) => f.envId === env.id && f.path === normalized);
      if (!folder) return undefined;
      return { ...folder, environment: env };
    });

  const secretFind = vi
    .fn()
    .mockImplementation(async (filter: { $complex?: unknown }) => (filter?.$complex ? referredSecrets : []));
  const secretFindOne = vi.fn().mockResolvedValue(undefined);
  const secretFindBySecretKeys = vi.fn().mockResolvedValue([]);
  const secretValidate = vi.fn().mockResolvedValue(undefined);
  const createCipherPairWithDataKey = vi.fn().mockResolvedValue({
    encryptor: vi.fn(({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText })),
    decryptor: vi.fn(({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob)
  });

  const service = secretV2BridgeServiceFactory({
    secretsPermissionService: { getSecretsPermission } as unknown as TSecretsPermissionService,
    projectEnvDAL: {
      findOne: vi.fn(),
      findBySlugs: findEnvsBySlugs
    },
    folderDAL: {
      findBySecretPath,
      updateById: vi.fn(),
      findById: vi.fn(),
      findByManySecretPath,
      find: vi.fn(),
      findBySecretPathMultiEnv: vi.fn(),
      findSecretPathByFolderIds: vi.fn()
    },
    secretDAL: {
      find: secretFind,
      findOne: secretFindOne,
      findBySecretKeys: secretFindBySecretKeys,
      findProjectBlindIndexStatus: vi.fn().mockResolvedValue({ version: ProjectVersion.V3 })
    } as never,
    projectDAL: {
      findById: vi
        .fn()
        .mockResolvedValue({ id: "project-1", version: ProjectVersion.V3, secretDetectionIgnoreValues: [] }),
      find: vi.fn()
    },
    kmsDataKeyService: {
      createCipherPairWithDataKey,
      startService: vi.fn()
    } as never,
    secretValidationRuleService: { validateSecrets: secretValidate },
    secretTagDAL: { find: vi.fn().mockResolvedValue([]) } as never,
    secretVersionDAL: {} as never,
    secretVersionTagDAL: { insertMany: vi.fn() },
    folderCommitService: { createCommit: vi.fn() },
    eventEmitter: {} as never,
    secretImportDAL: { find: vi.fn(), findByFolderIds: vi.fn(), findByIds: vi.fn() },
    secretQueueService: { syncSecrets: vi.fn(), handleSecretReminder: vi.fn(), removeSecretReminder: vi.fn() },
    secretChangePolicyService: { getSecretApprovalPolicy: vi.fn() },
    secretChangeRequestService: { createSecretApprovalRequestV2Bridge: vi.fn() },
    resourceMetadataDAL: { insertMany: vi.fn(), delete: vi.fn() },
    keyStore: {
      getItemPrimary: vi.fn(),
      getItem: vi.fn(),
      getItemBuffer: vi.fn(),
      setExpiry: vi.fn(),
      setItemWithExpiry: vi.fn(),
      deleteItem: vi.fn(),
      pgGetIntItem: vi.fn(),
      hashGet: vi.fn(),
      hashSet: vi.fn()
    },
    reminderService: {
      prepareReminder: vi.fn(),
      applyReminder: vi.fn(),
      createReminder: vi.fn(),
      getReminder: vi.fn(),
      moveReminders: vi.fn(),
      copyReminders: vi.fn()
    },
    projectFolderGrantDAL: { find: vi.fn() },
    orgDAL: { findOrgById: vi.fn() }
  });

  return { service, permission, secretFind, secretFindOne, createCipherPairWithDataKey };
};

describe("$validateSecretReferences", () => {
  test("enforces permissions per resolved folder when two environments define the same secret key", async () => {
    const { service, permission } = buildService({
      rules: [
        {
          action: ProjectPermissionSecretActions.DescribeSecret,
          subject: ProjectPermissionSub.Secrets,
          conditions: { environment: "dev" }
        }
      ],
      referredSecrets: [
        makeReferredSecret({ id: "s-dev", folderId: "folder-dev-root", key: "API_KEY" }),
        makeReferredSecret({ id: "s-prod", folderId: "folder-prod-root", key: "API_KEY" })
      ]
    });

    await expect(
      service.$validateSecretReferences("project-1", permission, [
        { environment: "dev", secretPath: "/", secretKey: "API_KEY" },
        { environment: "prod", secretPath: "/", secretKey: "API_KEY" }
      ])
    ).rejects.toThrow(PermissionDeniedError);
  });

  test("enforces permissions per folder path within the same environment for same-named keys", async () => {
    const { service, permission } = buildService({
      rules: [
        {
          action: ProjectPermissionSecretActions.DescribeSecret,
          subject: ProjectPermissionSub.Secrets,
          conditions: { environment: "dev", secretPath: "/app" }
        }
      ],
      referredSecrets: [
        makeReferredSecret({ id: "s-app", folderId: "folder-dev-app", key: "TOKEN" }),
        makeReferredSecret({ id: "s-restricted", folderId: "folder-dev-restricted", key: "TOKEN" })
      ]
    });

    await expect(
      service.$validateSecretReferences("project-1", permission, [
        { environment: "dev", secretPath: "/app/", secretKey: "TOKEN" },
        { environment: "dev", secretPath: "/restricted", secretKey: "TOKEN" }
      ])
    ).rejects.toThrow(PermissionDeniedError);
  });

  test("checks the secret tags belonging to each resolved folder independently", async () => {
    const { service, permission } = buildService({
      rules: [
        {
          action: ProjectPermissionSecretActions.DescribeSecret,
          subject: ProjectPermissionSub.Secrets
        },
        {
          inverted: true,
          action: ProjectPermissionSecretActions.DescribeSecret,
          subject: ProjectPermissionSub.Secrets,
          conditions: { environment: "prod", secretTags: { $in: ["restricted"] } }
        }
      ],
      referredSecrets: [
        makeReferredSecret({ id: "s-dev", folderId: "folder-dev-root", key: "DB_PASS" }),
        makeReferredSecret({
          id: "s-prod",
          folderId: "folder-prod-root",
          key: "DB_PASS",
          tags: [{ id: "tag-1", slug: "restricted", name: "restricted", color: "#000" }]
        })
      ]
    });

    await expect(
      service.$validateSecretReferences("project-1", permission, [
        { environment: "dev", secretPath: "/", secretKey: "DB_PASS" },
        { environment: "prod", secretPath: "/", secretKey: "DB_PASS" }
      ])
    ).rejects.toThrow(PermissionDeniedError);
  });

  test("allows references when all existing referenced secrets are describable and skips missing targets", async () => {
    const { service, permission, secretFind } = buildService({
      rules: [
        {
          action: ProjectPermissionSecretActions.DescribeSecret,
          subject: ProjectPermissionSub.Secrets
        }
      ],
      referredSecrets: [
        makeReferredSecret({ id: "s-dev", folderId: "folder-dev-root", key: "API_KEY" }),
        makeReferredSecret({ id: "s-prod", folderId: "folder-prod-root", key: "API_KEY" })
      ]
    });

    const result = await service.$validateSecretReferences("project-1", permission, [
      { environment: "dev", secretPath: "/", secretKey: "API_KEY" },
      { environment: "dev", secretPath: "/", secretKey: "API_KEY" },
      { environment: "prod", secretPath: "/", secretKey: "API_KEY" },
      { environment: "prod", secretPath: "/missing", secretKey: "DOES_NOT_EXIST" }
    ]);

    expect(result).toHaveLength(2);
    expect(secretFind).toHaveBeenCalledTimes(1);
    const complexArg = secretFind.mock.calls[0][0].$complex.value;
    expect(complexArg).toHaveLength(2);
  });

  test("createSecret blocks cross-env same-key reference bypass during secret creation", async () => {
    const { service, createCipherPairWithDataKey } = buildService({
      rules: [
        {
          action: [ProjectPermissionSecretActions.Create, ProjectPermissionSecretActions.DescribeSecret],
          subject: ProjectPermissionSub.Secrets,
          conditions: { environment: "dev" }
        }
      ],
      referredSecrets: [
        makeReferredSecret({ id: "s-dev", folderId: "folder-dev-root", key: "API_KEY" }),
        makeReferredSecret({ id: "s-prod", folderId: "folder-prod-root", key: "API_KEY" })
      ]
    });

    await expect(
      service.createSecret({
        actor: actorOf(),
        projectId: "project-1",
        environment: "dev",
        secretPath: "/",
        secretName: "NEW_SECRET",
        secretValue: `\${dev.API_KEY}-\${prod.API_KEY}`,
        type: SecretType.Shared
      })
    ).rejects.toThrow(PermissionDeniedError);

    expect(createCipherPairWithDataKey).not.toHaveBeenCalled();
  });

  test("updateSecret blocks cross-env same-key reference bypass and validates references once", async () => {
    const { service, secretFindOne, secretFind } = buildService({
      rules: [
        {
          action: [ProjectPermissionSecretActions.Edit, ProjectPermissionSecretActions.DescribeSecret],
          subject: ProjectPermissionSub.Secrets,
          conditions: { environment: "dev" }
        }
      ],
      referredSecrets: [
        makeReferredSecret({ id: "s-dev", folderId: "folder-dev-root", key: "API_KEY" }),
        makeReferredSecret({ id: "s-prod", folderId: "folder-prod-root", key: "API_KEY" })
      ]
    });

    secretFindOne.mockResolvedValue({
      id: "target-1",
      folderId: "folder-dev-root",
      key: "EXISTING",
      type: SecretType.Shared,
      tags: []
    });

    await expect(
      service.updateSecret({
        actor: actorOf(),
        projectId: "project-1",
        environment: "dev",
        secretPath: "/",
        secretName: "EXISTING",
        secretValue: `\${dev.API_KEY}-\${prod.API_KEY}`,
        type: SecretType.Shared
      })
    ).rejects.toThrow(PermissionDeniedError);

    expect(secretFind).toHaveBeenCalledTimes(1);
  });

  test("createManySecret blocks cross-env same-key reference bypass across different secrets in a batch", async () => {
    const { service, createCipherPairWithDataKey } = buildService({
      rules: [
        {
          action: [ProjectPermissionSecretActions.Create, ProjectPermissionSecretActions.DescribeSecret],
          subject: ProjectPermissionSub.Secrets,
          conditions: { environment: "dev" }
        }
      ],
      referredSecrets: [
        makeReferredSecret({ id: "s-dev", folderId: "folder-dev-root", key: "API_KEY" }),
        makeReferredSecret({ id: "s-prod", folderId: "folder-prod-root", key: "API_KEY" })
      ]
    });

    await expect(
      service.createManySecret({
        actor: actorOf(),
        projectId: "project-1",
        environment: "dev",
        secretPath: "/",
        secrets: [
          { secretKey: "FIRST", secretValue: `\${dev.API_KEY}` },
          { secretKey: "SECOND", secretValue: `\${prod.API_KEY}` }
        ]
      })
    ).rejects.toThrow(PermissionDeniedError);

    expect(createCipherPairWithDataKey).not.toHaveBeenCalled();
  });
});
