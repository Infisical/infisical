import { describe, expect, it, vi } from "vitest";

import { createRelativeImportExpander } from "./secret-v2-bridge-fns";

vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("../project-folder-grant/project-folder-grant-fns", () => ({ isCrossProjectEnabled: vi.fn() }));

type Args = Parameters<typeof createRelativeImportExpander>[0];

const folders: Record<string, string> = {
  "dev:/app": "dev-app",
  "staging:/app": "staging-app",
  "staging:/shared": "staging-shared"
};

const secretsByFolder: Record<string, Record<string, string>> = {
  "dev-app": {},
  "staging-app": {
    DATABASE_URL: `\${staging.shared.DB_HOST}`,
    DATABASE_URL_WITH_ENVSUBST: `\${staging.shared.DB_HOST} \${NOT_IN_INFISICAL}`
  },
  "staging-shared": { DB_HOST: "db.internal" }
};

const createExpander = () => {
  const folderDAL = {
    findBySecretPath: vi
      .fn<Args["folderDAL"]["findBySecretPath"]>()
      .mockImplementation(async (_projectId, env, secretPath) => {
        const id = folders[`${env}:${secretPath}`];
        return id ? ({ id } as Awaited<ReturnType<Args["folderDAL"]["findBySecretPath"]>>) : undefined;
      })
  };

  const secretDAL = {
    findByFolderId: vi.fn<Args["secretDAL"]["findByFolderId"]>().mockImplementation(async ({ folderId }) =>
      Object.entries(secretsByFolder[folderId] ?? {}).map(([key, value]) => ({
        id: `${folderId}-${key}`,
        _id: `${folderId}-${key}`,
        key,
        version: 1,
        type: "shared",
        folderId,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        encryptedValue: Buffer.from(value),
        tags: [],
        secretMetadata: [],
        userId: null
      }))
    )
  };

  // dev:/app imports staging:/app
  const secretImportDAL = {
    findByFolderIds: vi.fn(async ([folderId]: string[]) =>
      folderId === "dev-app"
        ? [{ id: "import", importPath: "/app", importEnv: { id: "staging", slug: "staging", name: "Staging" } }]
        : []
    ),
    findByIds: vi.fn(async () => [])
  } as unknown as Args["secretImportDAL"];

  return createRelativeImportExpander({
    projectId: "project",
    currentEnvironment: "dev",
    currentSecretPath: "/app",
    folderDAL,
    secretDAL,
    secretImportDAL,
    decryptSecretValue: (value) => value?.toString() ?? "",
    canExpandValue: () => true
  });
};

describe("createRelativeImportExpander", () => {
  it("expands an imported secret that references another environment", async () => {
    const { expandImportedSecretReferences } = createExpander();

    await expect(
      expandImportedSecretReferences({
        value: `\${staging.shared.DB_HOST}`,
        environment: "staging",
        secretPath: "/app",
        secretKey: "DATABASE_URL"
      })
    ).resolves.toBe("db.internal");
  });

  it("leaves a reference to a missing secret untouched and still expands the rest of the value", async () => {
    const { expandImportedSecretReferences } = createExpander();

    await expect(
      expandImportedSecretReferences({
        value: `\${staging.shared.DB_HOST} \${NOT_IN_INFISICAL}`,
        environment: "staging",
        secretPath: "/app",
        secretKey: "DATABASE_URL_WITH_ENVSUBST"
      })
    ).resolves.toBe(`db.internal \${NOT_IN_INFISICAL}`);
  });
});
