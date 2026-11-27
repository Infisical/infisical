import { describe, expect, it, vi } from "vitest";

import { Permission } from "@app/domains/platform/access-control/ce/module";
import {
  actorContext,
  actorOrg,
  userPrincipal
} from "@app/domains/platform/organizations/ce/testing/actor-context-fixture";
import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/domains/platform/projects/ce/module";
import { FolderGrants } from "@app/domains/secrets-manager/secrets/ce/module";
import { TConcurrencySlot } from "@app/lib/concurrency/concurrency-limiter";

import { secretImportServiceFactory } from "./secret-import-service";

type TDeps = Parameters<typeof secretImportServiceFactory>[0];
type TSlotOptions = Parameters<TConcurrencySlot>[1];

const ability = (rules: unknown[]) => Permission.fromRules({ rules: rules as never });

const readsImportedSecrets = ability([
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.SecretImports },
  { action: ProjectPermissionSecretActions.ReadValue, subject: ProjectPermissionSub.Secrets }
]);

const makeService = ({ permission = readsImportedSecrets }: { permission?: ReturnType<typeof ability> } = {}) => {
  const decrypt = vi.fn(({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob);
  const findSecrets = vi.fn().mockResolvedValue(
    ["A", "B"].map((key) => ({
      id: key,
      key,
      version: 1,
      type: "shared",
      folderId: "shared-folder",
      createdAt: new Date(0),
      updatedAt: new Date(0),
      encryptedValue: Buffer.from(`value-${key}`),
      encryptedComment: null,
      skipMultilineEncoding: false,
      tags: [],
      secretMetadata: []
    }))
  );

  const deps = {
    secretsPermissionService: {
      getSecretsPermission: vi.fn().mockResolvedValue({ permission, folderGrants: FolderGrants.none() })
    },
    folderDAL: {
      findBySecretPath: vi.fn().mockResolvedValue({ id: "root-folder" }),
      findByManySecretPath: vi.fn().mockResolvedValue([{ id: "shared-folder", envId: "env", path: "/shared" }])
    },
    secretImportDAL: {
      find: vi.fn().mockResolvedValue([
        {
          id: "import",
          folderId: "root-folder",
          importPath: "/shared",
          importEnv: { id: "env", slug: "dev", name: "Development", projectId: "project" },
          position: 1,
          version: 1,
          isReplication: false,
          isReserved: false,
          createdAt: new Date(0),
          updatedAt: new Date(0)
        }
      ]),
      findByFolderIds: vi.fn().mockResolvedValue([]),
      findByIds: vi.fn().mockResolvedValue([])
    },
    secretV2BridgeDAL: { find: findSecrets },
    projectBotService: { getBotKey: vi.fn().mockResolvedValue({ shouldUseSecretV2Bridge: true }) },
    kmsDataKeyService: { createCipherPairWithDataKey: vi.fn().mockResolvedValue({ decryptor: decrypt }) },
    orgDAL: { findOrgById: vi.fn().mockResolvedValue({ allowCrossProjectSecretSharing: false }) }
  };

  return { service: secretImportServiceFactory(deps as unknown as TDeps), decrypt, findSecrets };
};

const request = ({ actorId = "user-1", ...overrides }: { path?: string; actorId?: string } = {}) => ({
  projectId: "project",
  environment: "dev",
  path: "/app",
  ...overrides,
  actor: actorContext({ principal: userPrincipal({ id: actorId }), org: actorOrg({ id: "org" }) })
});

const recordingSlot = () => {
  const reported: number[] = [];
  const sizeKeys: (string | undefined)[] = [];
  const slot: TConcurrencySlot = (work, opts?: TSlotOptions) => {
    sizeKeys.push(opts?.sizeKey);
    return work((secretCount) => reported.push(secretCount));
  };
  return { slot, reported, sizeKeys };
};

describe("getRawSecretsFromImports", () => {
  it("returns the imported secrets when it is given no read slot", async () => {
    const { service } = makeService();

    const imports = await service.getRawSecretsFromImports(request());

    expect(imports.map((folder) => folder.secrets.map((secret) => secret.secretValue))).toEqual([
      ["value-A", "value-B"]
    ]);
  });

  it("loads the secrets inside the read slot and reports them", async () => {
    const { service } = makeService();
    const { slot, reported } = recordingSlot();

    const imports = await service.getRawSecretsFromImports({ ...request(), secretReadSlot: slot });

    expect(imports[0].secrets).toHaveLength(2);
    expect(reported).toEqual([2, 2]);
  });

  it("decrypts nothing when the read slot refuses the rows it loaded", async () => {
    const { service, decrypt, findSecrets } = makeService();
    const refusingSlot: TConcurrencySlot = (work) =>
      work(() => {
        throw new Error("refused");
      });

    await expect(service.getRawSecretsFromImports({ ...request(), secretReadSlot: refusingSlot })).rejects.toThrow(
      "refused"
    );
    expect(findSecrets).toHaveBeenCalledTimes(1);
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("takes no read slot for a caller who cannot read the imports", async () => {
    const { service } = makeService({ permission: ability([]) });
    const { slot, sizeKeys } = recordingSlot();

    await expect(service.getRawSecretsFromImports({ ...request(), secretReadSlot: slot })).rejects.toThrow();
    expect(sizeKeys).toEqual([]);
  });

  it("remembers a read's size per project, environment and path, whoever the caller is", async () => {
    const { service } = makeService();
    const { slot, sizeKeys } = recordingSlot();

    await service.getRawSecretsFromImports({ ...request(), secretReadSlot: slot });
    await service.getRawSecretsFromImports({ ...request({ actorId: "user-2" }), secretReadSlot: slot });
    await service.getRawSecretsFromImports({ ...request({ path: "/other" }), secretReadSlot: slot });

    const [first, sameReadByAnotherCaller, anotherPath] = sizeKeys;
    expect(first).toMatch(/^project:/);
    expect(sameReadByAnotherCaller).toBe(first);
    expect(anotherPath).not.toBe(first);
  });
});
