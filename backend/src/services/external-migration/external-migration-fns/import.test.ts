import { describe, expect, test, vi } from "vitest";

import { FakeKmsCore } from "@app/domains/platform/kms-core/ce/testing/fake-kms-core";
import { ActorType } from "@app/services/auth/auth-type";

import { TImportDataIntoInfisicalDTO } from "./envkey";
import { importDataIntoInfisicalFn } from "./import";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const ORG_ID = "00000000-0000-4000-8000-000000000001";

const build = ({ existingSecretKeys = [] as string[] }) => {
  const kms = new FakeKmsCore();
  const withSpy = vi.spyOn(kms.dataKeyService, "within");

  const committedProjects: string[] = [];
  const transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = { createdProjects: [] as string[], isTransaction: true, executionPromise: Promise.resolve() };
    const result = await cb(tx);
    committedProjects.push(...tx.createdProjects);
    return result;
  });

  const createProject = vi.fn(async ({ tx }: { tx: { createdProjects: string[] } }) => {
    const id = `00000000-0000-4000-8000-00000000010${tx.createdProjects.length}`;
    tx.createdProjects.push(id);
    return { id };
  });

  let idCounter = 0;
  const nextId = () => {
    idCounter += 1;
    return `00000000-0000-4000-8000-0000000002${String(idCounter).padStart(2, "0")}`;
  };

  const dto = {
    projectDAL: { transaction },
    projectEnvDAL: {
      findOne: vi.fn().mockResolvedValue(undefined),
      findLastEnvPosition: vi.fn().mockResolvedValue(0),
      create: vi.fn(async (env: { slug: string }) => ({ id: nextId(), slug: env.slug })),
      find: vi.fn()
    },
    dataKeyService: kms.dataKeyService,
    secretDAL: {
      findBySecretKeys: vi.fn().mockResolvedValue(existingSecretKeys.map((key) => ({ key }))),
      insertMany: vi.fn(async (rows: { key: string }[]) => rows.map((row) => ({ ...row, id: nextId() }))),
      upsertSecretReferences: vi.fn(),
      find: vi.fn().mockResolvedValue([])
    },
    folderDAL: {
      create: vi.fn(async () => ({ id: nextId() })),
      findBySecretPath: vi.fn(async () => ({ id: nextId() })),
      findById: vi.fn()
    },
    secretVersionDAL: {
      insertMany: vi.fn(async (rows: unknown[]) => rows.map(() => ({ id: nextId() }))),
      create: vi.fn()
    },
    secretTagDAL: { saveTagsToSecretV2: vi.fn().mockResolvedValue([]), create: vi.fn(), find: vi.fn() },
    secretVersionTagDAL: { insertMany: vi.fn(), create: vi.fn() },
    resourceMetadataDAL: { insertMany: vi.fn() },
    eventEmitter: { emit: vi.fn() },
    projectService: { createProject },
    folderCommitService: { createCommit: vi.fn() },
    folderVersionDAL: { create: vi.fn() },
    input: {
      data: {
        projects: [{ id: "p1", name: "Imported" }],
        environments: [{ id: "e1", name: "Production", projectId: "p1" }],
        folders: [],
        secrets: [{ id: "s1", name: "API_KEY", value: "value", environmentId: "e1" }]
      },
      actor: ActorType.USER,
      actorId: "00000000-0000-4000-8000-000000000003",
      actorOrgId: ORG_ID,
      actorAuthMethod: null
    }
  } as unknown as TImportDataIntoInfisicalDTO;

  return { dto, transaction, createProject, withSpy, committedProjects };
};

describe("importDataIntoInfisicalFn", () => {
  test("should leave no project behind when writing the secrets fails", async () => {
    // Setup
    const { dto, transaction, committedProjects } = build({ existingSecretKeys: ["API_KEY"] });

    // Action
    const result = importDataIntoInfisicalFn(dto);

    // Assert
    await expect(result).rejects.toThrow("Secret already exists: API_KEY");
    expect(committedProjects).toEqual([]);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  test("should create the projects and write the secrets in one transaction using KMS inside it", async () => {
    // Setup
    const { dto, transaction, createProject, withSpy, committedProjects } = build({});

    // Action
    const result = await importDataIntoInfisicalFn(dto);

    // Assert
    expect(result).toEqual({ projectsNotImported: [] });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(committedProjects).toHaveLength(1);
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(createProject.mock.calls[0][0].tx).toBeDefined();
    expect(withSpy).toHaveBeenCalled();
  });
});
