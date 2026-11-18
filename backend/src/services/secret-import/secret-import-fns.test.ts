import { describe, expect, it, vi } from "vitest";

import { ClientClosedRequestError } from "@app/lib/errors";

import {
  fnSecretsFromImports,
  fnSecretsV2FromImports,
} from "./secret-import-fns";

type Args = Parameters<typeof fnSecretsV2FromImports>[0];

const makeArgs = (overrides: Partial<Args> = {}) => {
  const findByManySecretPath = vi
    .fn<Args["folderDAL"]["findByManySecretPath"]>()
    .mockResolvedValue([
      { id: "shared-folder", envId: "env", path: "/shared" },
    ] as Awaited<ReturnType<Args["folderDAL"]["findByManySecretPath"]>>);
  const find = vi.fn<Args["secretDAL"]["find"]>().mockResolvedValue(
    ["A", "B"].map((key) => ({
      id: key,
      key,
      version: 1,
      type: "shared",
      folderId: "shared-folder",
      createdAt: new Date(0),
      updatedAt: new Date(0),
      encryptedValue: Buffer.from(`\${${key}_REF}`),
      encryptedComment: null,
      skipMultilineEncoding: false,
      tags: [],
      secretMetadata: [],
    })) as unknown as Awaited<ReturnType<Args["secretDAL"]["find"]>>,
  );
  const findByFolderIds = vi
    .fn<Args["secretImportDAL"]["findByFolderIds"]>()
    .mockResolvedValue([]);

  const args: Args = {
    secretImports: [
      {
        id: "import",
        folderId: "root-folder",
        importPath: "/shared",
        importEnv: { id: "env", slug: "dev", name: "Development" },
        position: 1,
        version: 1,
        isReplication: false,
        isReserved: false,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      } as Args["secretImports"][number],
    ],
    folderDAL: { findByManySecretPath },
    secretDAL: { find, findByFolderIds: vi.fn() },
    secretImportDAL: { findByFolderIds, findByIds: vi.fn() },
    orgDAL: {
      findOrgById: vi
        .fn()
        .mockResolvedValue({ allowCrossProjectSecretSharing: false }),
    },
    decryptor: (value) => value?.toString() ?? "",
    hasSecretAccess: () => true,
    viewSecretValue: true,
    kmsDataKeyService: { createCipherPairWithDataKey: vi.fn() } as never,
    actorOrgId: "org",
    ...overrides,
  };
  return { args, findByManySecretPath, find, findByFolderIds };
};

describe("fnSecretsV2FromImports", () => {
  it("expands imported secrets when the client stays connected", async () => {
    const { args } = makeArgs({
      abortSignal: new AbortController().signal,
      expandSecretReferences: async ({ secretKey }) => `expanded-${secretKey}`,
    });

    const imports = await fnSecretsV2FromImports(args);

    expect(imports[0].secrets.map((s) => s.secretValue)).toEqual([
      "expanded-A",
      "expanded-B",
    ]);
  });

  it("stops before reading any import when the client already disconnected", async () => {
    const controller = new AbortController();
    controller.abort();
    const { args, findByManySecretPath, find } = makeArgs({
      abortSignal: controller.signal,
    });

    await expect(fnSecretsV2FromImports(args)).rejects.toBeInstanceOf(
      ClientClosedRequestError,
    );
    expect(findByManySecretPath).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it("stops before walking deeper import levels once the client disconnects", async () => {
    const controller = new AbortController();
    const { args, findByManySecretPath, findByFolderIds } = makeArgs({
      abortSignal: controller.signal,
    });
    findByFolderIds.mockImplementationOnce(async () => {
      controller.abort();
      return [
        {
          ...args.secretImports[0],
          id: "deeper-import",
          folderId: "shared-folder",
          importPath: "/deeper",
        },
      ] as Awaited<ReturnType<Args["secretImportDAL"]["findByFolderIds"]>>;
    });

    await expect(fnSecretsV2FromImports(args)).rejects.toBeInstanceOf(
      ClientClosedRequestError,
    );
    expect(findByManySecretPath).toHaveBeenCalledTimes(1);
  });

  it("throws instead of returning partially expanded values when expansion stops on a disconnect", async () => {
    const { args } = makeArgs({
      expandSecretReferences: async ({ secretKey }) => {
        if (secretKey === "B") throw new ClientClosedRequestError();
        return `expanded-${secretKey}`;
      },
    });

    await expect(fnSecretsV2FromImports(args)).rejects.toBeInstanceOf(
      ClientClosedRequestError,
    );
  });

  it("keeps other expansion failures non-fatal", async () => {
    const { args } = makeArgs({
      expandSecretReferences: async ({ secretKey }) => {
        if (secretKey === "B") throw new Error("reference not found");
        return `expanded-${secretKey}`;
      },
    });

    const imports = await fnSecretsV2FromImports(args);

    expect(imports[0].secrets.map((s) => s.secretValue)).toEqual([
      "expanded-A",
      `\${B_REF}`,
    ]);
  });

  it("resolves imports for multiple destination folders importing the same source", async () => {
    const { args, findByManySecretPath } = makeArgs({
      secretImports: [
        {
          id: "import-dest-1",
          folderId: "dest-folder-1",
          importPath: "/shared",
          importEnv: { id: "env", slug: "dev", name: "Development" },
          position: 1,
          version: 1,
          isReplication: false,
          isReserved: false,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        } as Args["secretImports"][number],
        {
          id: "import-dest-2",
          folderId: "dest-folder-2",
          importPath: "/shared",
          importEnv: { id: "env", slug: "dev", name: "Development" },
          position: 1,
          version: 1,
          isReplication: false,
          isReserved: false,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        } as Args["secretImports"][number],
      ],
    });

    const imports = await fnSecretsV2FromImports(args);

    expect(imports).toHaveLength(2);
    expect(imports.map((item) => item.importFolderId)).toEqual([
      "dest-folder-1",
      "dest-folder-2",
    ]);
    expect(imports[0].secrets.map((s) => s.key)).toEqual(["A", "B"]);
    expect(imports[1].secrets.map((s) => s.key)).toEqual(["A", "B"]);
    // findByManySecretPath was queried once for the deduplicated source path
    expect(findByManySecretPath).toHaveBeenCalledWith([
      { envId: "env", secretPath: "/shared" },
    ]);
  });

  it("resolves distinct cross-project imports with matching environment slugs and paths", async () => {
    const findByManySecretPath = vi
      .fn<Args["folderDAL"]["findByManySecretPath"]>()
      .mockResolvedValue([
        { id: "folder-proj-a", envId: "env-a", path: "/shared" },
        { id: "folder-proj-b", envId: "env-b", path: "/shared" },
      ] as Awaited<ReturnType<Args["folderDAL"]["findByManySecretPath"]>>);

    const find = vi
      .fn<Args["secretDAL"]["find"]>()
      .mockImplementation(async (query: any) => {
        const folderIds = query?.$in?.folderId || [];
        return folderIds.flatMap((folderId: string) => [
          {
            id: `secret-${folderId}`,
            key: `KEY_FROM_${folderId}`,
            version: 1,
            type: "shared",
            folderId,
            createdAt: new Date(0),
            updatedAt: new Date(0),
            encryptedValue: Buffer.from(`val-${folderId}`),
            encryptedComment: null,
            skipMultilineEncoding: false,
            tags: [],
            secretMetadata: [],
          },
        ]) as unknown as Awaited<ReturnType<Args["secretDAL"]["find"]>>;
      });

    const projectFolderGrantDAL = {
      find: vi.fn().mockResolvedValue([
        { sourceFolderId: "folder-proj-a", targetProjectId: "target-proj" },
        { sourceFolderId: "folder-proj-b", targetProjectId: "target-proj" },
      ]),
    };

    const { args } = makeArgs({
      projectId: "target-proj",
      actorOrgId: "org-1",
      kmsDataKeyService: {
        createCipherPairWithDataKey: vi.fn().mockResolvedValue({
          decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) =>
            cipherTextBlob.toString(),
        }),
      } as never,
      orgDAL: {
        findOrgById: vi
          .fn()
          .mockResolvedValue({ allowCrossProjectSecretSharing: true }),
      },
      projectFolderGrantDAL,
      folderDAL: { findByManySecretPath },
      secretDAL: { find, findByFolderIds: vi.fn() },
      secretImports: [
        {
          id: "import-a",
          folderId: "target-dest",
          importPath: "/shared",
          importEnv: {
            id: "env-a",
            slug: "dev",
            name: "Development",
            projectId: "proj-a",
          },
          position: 1,
          version: 1,
          isReplication: false,
          isReserved: false,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        } as Args["secretImports"][number],
        {
          id: "import-b",
          folderId: "target-dest",
          importPath: "/shared",
          importEnv: {
            id: "env-b",
            slug: "dev",
            name: "Development",
            projectId: "proj-b",
          },
          position: 2,
          version: 1,
          isReplication: false,
          isReserved: false,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        } as Args["secretImports"][number],
      ],
    });

    const imports = await fnSecretsV2FromImports(args);

    expect(imports).toHaveLength(2);
    expect(imports[0].folderId).toBe("folder-proj-a");
    expect(imports[1].folderId).toBe("folder-proj-b");
    expect(imports[0].secrets[0].key).toBe("KEY_FROM_folder-proj-a");
    expect(imports[1].secrets[0].key).toBe("KEY_FROM_folder-proj-b");
  });

  it("deduplicates identical imports within the same destination folder", async () => {
    const { args } = makeArgs({
      secretImports: [
        {
          id: "import-dup-1",
          folderId: "dest-folder",
          importPath: "/shared",
          importEnv: { id: "env", slug: "dev", name: "Development" },
          position: 1,
          version: 1,
          isReplication: false,
          isReserved: false,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        } as Args["secretImports"][number],
        {
          id: "import-dup-2",
          folderId: "dest-folder",
          importPath: "/shared",
          importEnv: { id: "env", slug: "dev", name: "Development" },
          position: 2,
          version: 1,
          isReplication: false,
          isReserved: false,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        } as Args["secretImports"][number],
      ],
    });

    const imports = await fnSecretsV2FromImports(args);

    expect(imports).toHaveLength(1);
    expect(imports[0].id).toBe("import-dup-1");
  });
});

describe("fnSecretsFromImports", () => {
  type LegacyArgs = Parameters<typeof fnSecretsFromImports>[0];

  const makeLegacyArgs = (abortSignal?: AbortSignal) => {
    const findByManySecretPath = vi
      .fn<LegacyArgs["folderDAL"]["findByManySecretPath"]>()
      .mockResolvedValue([
        { id: "shared-folder", envId: "env", path: "/shared" },
      ] as Awaited<
        ReturnType<LegacyArgs["folderDAL"]["findByManySecretPath"]>
      >);
    const find = vi.fn().mockResolvedValue([]);
    const findByFolderIds = vi
      .fn<LegacyArgs["secretImportDAL"]["findByFolderIds"]>()
      .mockResolvedValue([]);
    const rootImport = {
      id: "import",
      folderId: "root-folder",
      importPath: "/shared",
      importEnv: { id: "env", slug: "dev", name: "Development" },
      position: 1,
      version: 1,
      isReplication: false,
      isReserved: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } as LegacyArgs["allowedImports"][number];

    const args: LegacyArgs = {
      allowedImports: [rootImport],
      folderDAL: { findByManySecretPath },
      secretDAL: { find },
      secretImportDAL: { findByFolderIds },
      abortSignal,
    };
    return { args, rootImport, findByManySecretPath, find, findByFolderIds };
  };

  it("stops before reading any import when the client already disconnected", async () => {
    const controller = new AbortController();
    controller.abort();
    const { args, findByManySecretPath, find } = makeLegacyArgs(
      controller.signal,
    );

    await expect(fnSecretsFromImports(args)).rejects.toBeInstanceOf(
      ClientClosedRequestError,
    );
    expect(findByManySecretPath).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it("stops before walking deeper import levels once the client disconnects", async () => {
    const controller = new AbortController();
    const { args, rootImport, findByManySecretPath, findByFolderIds } =
      makeLegacyArgs(controller.signal);
    findByFolderIds.mockImplementationOnce(async () => {
      controller.abort();
      return [
        {
          ...rootImport,
          id: "deeper-import",
          folderId: "shared-folder",
          importPath: "/deeper",
        },
      ] as Awaited<
        ReturnType<LegacyArgs["secretImportDAL"]["findByFolderIds"]>
      >;
    });

    await expect(fnSecretsFromImports(args)).rejects.toBeInstanceOf(
      ClientClosedRequestError,
    );
    expect(findByManySecretPath).toHaveBeenCalledTimes(1);
  });

  it("walks every level when the client stays connected", async () => {
    const { args, rootImport, findByManySecretPath, findByFolderIds } =
      makeLegacyArgs(new AbortController().signal);
    findByFolderIds.mockResolvedValueOnce([
      {
        ...rootImport,
        id: "deeper-import",
        folderId: "shared-folder",
        importPath: "/deeper",
      },
    ] as Awaited<ReturnType<LegacyArgs["secretImportDAL"]["findByFolderIds"]>>);

    await fnSecretsFromImports(args);

    expect(findByManySecretPath).toHaveBeenCalledTimes(2);
  });

  it("resolves imports for multiple destination folders importing the same source", async () => {
    const { args, rootImport, findByManySecretPath } = makeLegacyArgs();
    args.allowedImports = [
      { ...rootImport, id: "import-1", folderId: "folder-1" },
      { ...rootImport, id: "import-2", folderId: "folder-2" },
    ];

    const secrets = await fnSecretsFromImports(args);

    expect(secrets).toHaveLength(2);
    expect(secrets.map((s) => s.importFolderId)).toEqual([
      "folder-1",
      "folder-2",
    ]);
    expect(findByManySecretPath).toHaveBeenCalledWith([
      { envId: "env", secretPath: "/shared" },
    ]);
  });

  it("resolves distinct imports with matching environment slugs and paths", async () => {
    const { args, rootImport, findByManySecretPath } = makeLegacyArgs();
    findByManySecretPath.mockResolvedValue([
      { id: "folder-a", envId: "env-a", path: "/shared" },
      { id: "folder-b", envId: "env-b", path: "/shared" },
    ] as any);

    args.allowedImports = [
      {
        ...rootImport,
        id: "import-a",
        folderId: "target-dest",
        importEnv: { id: "env-a", slug: "dev", name: "Development" },
      },
      {
        ...rootImport,
        id: "import-b",
        folderId: "target-dest",
        importEnv: { id: "env-b", slug: "dev", name: "Development" },
      },
    ];

    const secrets = await fnSecretsFromImports(args);

    expect(secrets).toHaveLength(2);
    expect(secrets[0].folderId).toBe("folder-a");
    expect(secrets[1].folderId).toBe("folder-b");
  });

  it("deduplicates identical imports within the same destination folder", async () => {
    const { args, rootImport } = makeLegacyArgs();
    args.allowedImports = [
      { ...rootImport, id: "import-1", folderId: "folder-1" },
      { ...rootImport, id: "import-2", folderId: "folder-1" },
    ];

    const secrets = await fnSecretsFromImports(args);

    expect(secrets).toHaveLength(1);
    expect(secrets[0].id).toBe("import-1");
  });
});
