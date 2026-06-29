import { describe, expect, test, vi } from "vitest";

import { SecretType } from "@app/db/schemas";

import { fnSecretsV2FromImports } from "./secret-import-fns";

type TFolder = { id: string; envId: string; path: string };
type TImport = {
  id: string;
  folderId: string;
  importPath: string;
  isReplication?: boolean;
  isReserved?: boolean;
  importEnv: { id: string; slug: string; name: string };
};
type TSecret = { id: string; key: string; folderId: string };

const ENV = { id: "env-id", slug: "dev", name: "Development" };

// minimal decoration so the function's `.map` field accesses don't throw
const decorateSecret = (secret: TSecret) => ({
  ...secret,
  type: SecretType.Shared,
  tags: [] as { slug: string }[],
  secretMetadata: [] as { key: string; value: string; encryptedValue?: Buffer | null }[],
  encryptedValue: Buffer.from("root-value"),
  encryptedComment: Buffer.from(""),
  skipMultilineEncoding: false
});

/**
 * Builds DAL mocks that model a linear chain of folders where each folder
 * imports the secrets of the previous one:
 *
 *   /level{N} imports /level{N-1} imports ... imports / (root)
 *
 * A single secret lives in the root folder. Resolving the imports of the
 * deepest folder must surface that root secret regardless of chain length.
 */
const buildChain = (levels: number) => {
  // folders[0] is root ("/"), folders[i] is "/level{i}"
  const folders: TFolder[] = Array.from({ length: levels + 1 }, (_, i) => ({
    id: `folder-${i}`,
    envId: ENV.id,
    path: i === 0 ? "/" : `/level${i}`
  }));

  // each folder (except root) imports the folder one level shallower
  const imports: TImport[] = folders.slice(1).map((folder, i) => ({
    id: `import-${i + 1}`,
    folderId: folder.id,
    importPath: folders[i].path,
    importEnv: ENV
  }));

  const rootSecret: TSecret = { id: "secret-root", key: "ROOT_SECRET", folderId: folders[0].id };

  const folderByEnvPath = new Map(folders.map((f) => [`${f.envId}-${f.path}`, f]));
  const importsByFolderId = new Map<string, TImport[]>();
  imports.forEach((imp) => {
    const list = importsByFolderId.get(imp.folderId) ?? [];
    list.push(imp);
    importsByFolderId.set(imp.folderId, list);
  });

  const folderDAL = {
    findByManySecretPath: vi.fn(async (query: { envId: string; secretPath: string }[]) =>
      query.map(({ envId, secretPath }) => folderByEnvPath.get(`${envId}-${secretPath}`))
    )
  };

  const secretDAL = {
    find: vi.fn(async (filter: { $in: { folderId: string[] }; type: string }) => {
      const folderIds = filter.$in.folderId;
      return folderIds.includes(rootSecret.folderId) ? [decorateSecret(rootSecret)] : [];
    }),
    findByFolderIds: vi.fn(async () => [])
  };

  const secretImportDAL = {
    findByFolderIds: vi.fn(async (folderIds: string[]) => folderIds.flatMap((id) => importsByFolderId.get(id) ?? [])),
    findByIds: vi.fn(async () => [])
  };

  // the deepest folder's import list is the entry point
  const deepestFolder = folders[levels];
  const rootSecretImports = importsByFolderId.get(deepestFolder.id) ?? [];

  return { folderDAL, secretDAL, secretImportDAL, rootSecretImports };
};

const run = (chain: ReturnType<typeof buildChain>) =>
  fnSecretsV2FromImports({
    secretImports: chain.rootSecretImports as never,
    folderDAL: chain.folderDAL as never,
    secretDAL: chain.secretDAL as never,
    secretImportDAL: chain.secretImportDAL as never,
    decryptor: (value) => (value ? value.toString() : ""),
    viewSecretValue: true,
    hasSecretAccess: () => true
  });

const flattenKeys = (processed: Awaited<ReturnType<typeof fnSecretsV2FromImports>>) =>
  processed.flatMap((p) => p.secrets.map((s) => s.secretKey));

describe("fnSecretsV2FromImports - nested import depth propagation", () => {
  test("surfaces a root secret imported through one level", async () => {
    const processed = await run(buildChain(1));
    expect(flattenKeys(processed)).toContain("ROOT_SECRET");
  });

  test("surfaces a root secret imported through two levels", async () => {
    const processed = await run(buildChain(2));
    expect(flattenKeys(processed)).toContain("ROOT_SECRET");
  });

  test("surfaces a root secret imported through three levels", async () => {
    const processed = await run(buildChain(3));
    expect(flattenKeys(processed)).toContain("ROOT_SECRET");
  });

  test("surfaces a root secret imported through four levels", async () => {
    const processed = await run(buildChain(4));
    expect(flattenKeys(processed)).toContain("ROOT_SECRET");
  });
});
