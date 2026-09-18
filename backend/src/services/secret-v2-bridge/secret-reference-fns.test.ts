import { describe, expect, it, vi } from "vitest";

import { expandSecretReferencesFactory } from "./secret-reference-fns";

vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("../project-folder-grant/project-folder-grant-fns", () => ({ isCrossProjectEnabled: vi.fn() }));

describe("expandSecretReferencesFactory", () => {
  it("should share one folder read when resolving concurrent references to the same folder", async () => {
    type Args = Parameters<typeof expandSecretReferencesFactory>[0];
    const findBySecretPath = vi
      .fn<Args["folderDAL"]["findBySecretPath"]>()
      .mockResolvedValue({ id: "folder" } as Awaited<ReturnType<Args["folderDAL"]["findBySecretPath"]>>);
    const findByFolderId = vi.fn<Args["secretDAL"]["findByFolderId"]>().mockResolvedValue([
      {
        id: "secret",
        _id: "secret",
        key: "SOURCE",
        version: 1,
        type: "shared",
        folderId: "folder",
        createdAt: new Date(0),
        updatedAt: new Date(0),
        encryptedValue: Buffer.from("resolved"),
        tags: [],
        secretMetadata: [],
        userId: null
      }
    ]);
    const { expandSecretReferences } = expandSecretReferencesFactory({
      projectId: "project",
      folderDAL: { findBySecretPath },
      secretDAL: { findByFolderId },
      decryptSecretValue: (value) => value?.toString(),
      canExpandValue: vi.fn(() => true)
    });

    const results = await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        expandSecretReferences({
          secretKey: `KEY_${index}`,
          value: `\${SOURCE}`,
          environment: "prod",
          secretPath: "/shared"
        })
      )
    );

    expect(results).toEqual(Array(50).fill("resolved"));
    expect(findBySecretPath).toHaveBeenCalledOnce();
    expect(findByFolderId).toHaveBeenCalledOnce();
  });
});
