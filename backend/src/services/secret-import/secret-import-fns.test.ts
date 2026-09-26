import { describe, expect, it, vi } from "vitest";

import { ClientClosedRequestError } from "@app/lib/errors";

import { fnSecretsV2FromImports } from "./secret-import-fns";

type Args = Parameters<typeof fnSecretsV2FromImports>[0];

const makeArgs = (overrides: Partial<Args> = {}) => {
  const findByManySecretPath = vi
    .fn<Args["folderDAL"]["findByManySecretPath"]>()
    .mockResolvedValue([{ id: "shared-folder", envId: "env", path: "/shared" }] as Awaited<
      ReturnType<Args["folderDAL"]["findByManySecretPath"]>
    >);
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
      secretMetadata: []
    })) as unknown as Awaited<ReturnType<Args["secretDAL"]["find"]>>
  );
  const findByFolderIds = vi.fn<Args["secretImportDAL"]["findByFolderIds"]>().mockResolvedValue([]);

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
        updatedAt: new Date(0)
      } as Args["secretImports"][number]
    ],
    folderDAL: { findByManySecretPath },
    secretDAL: { find, findByFolderIds: vi.fn() },
    secretImportDAL: { findByFolderIds, findByIds: vi.fn() },
    orgDAL: { findOrgById: vi.fn().mockResolvedValue({ allowCrossProjectSecretSharing: false }) },
    decryptor: (value) => value?.toString() ?? "",
    hasSecretAccess: () => true,
    viewSecretValue: true,
    kmsService: { createCipherPairWithDataKey: vi.fn() },
    actorOrgId: "org",
    ...overrides
  };
  return { args, findByManySecretPath, find, findByFolderIds };
};

describe("fnSecretsV2FromImports", () => {
  it("expands imported secrets when the client stays connected", async () => {
    const { args } = makeArgs({
      abortSignal: new AbortController().signal,
      expandSecretReferences: async ({ secretKey }) => `expanded-${secretKey}`
    });

    const imports = await fnSecretsV2FromImports(args);

    expect(imports[0].secrets.map((s) => s.secretValue)).toEqual(["expanded-A", "expanded-B"]);
  });

  it("stops before reading any import when the client already disconnected", async () => {
    const controller = new AbortController();
    controller.abort();
    const { args, findByManySecretPath, find } = makeArgs({ abortSignal: controller.signal });

    await expect(fnSecretsV2FromImports(args)).rejects.toBeInstanceOf(ClientClosedRequestError);
    expect(findByManySecretPath).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it("stops before walking deeper import levels once the client disconnects", async () => {
    const controller = new AbortController();
    const { args, findByManySecretPath, findByFolderIds } = makeArgs({ abortSignal: controller.signal });
    findByFolderIds.mockImplementationOnce(async () => {
      controller.abort();
      return [
        {
          ...args.secretImports[0],
          id: "deeper-import",
          folderId: "shared-folder",
          importPath: "/deeper"
        }
      ] as Awaited<ReturnType<Args["secretImportDAL"]["findByFolderIds"]>>;
    });

    await expect(fnSecretsV2FromImports(args)).rejects.toBeInstanceOf(ClientClosedRequestError);
    expect(findByManySecretPath).toHaveBeenCalledTimes(1);
  });

  it("throws instead of returning partially expanded values when expansion stops on a disconnect", async () => {
    const { args } = makeArgs({
      expandSecretReferences: async ({ secretKey }) => {
        if (secretKey === "B") throw new ClientClosedRequestError();
        return `expanded-${secretKey}`;
      }
    });

    await expect(fnSecretsV2FromImports(args)).rejects.toBeInstanceOf(ClientClosedRequestError);
  });

  it("keeps other expansion failures non-fatal", async () => {
    const { args } = makeArgs({
      expandSecretReferences: async ({ secretKey }) => {
        if (secretKey === "B") throw new Error("reference not found");
        return `expanded-${secretKey}`;
      }
    });

    const imports = await fnSecretsV2FromImports(args);

    expect(imports[0].secrets.map((s) => s.secretValue)).toEqual(["expanded-A", `\${B_REF}`]);
  });
});
