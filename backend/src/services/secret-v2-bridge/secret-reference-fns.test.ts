import { describe, expect, it, vi } from "vitest";

import { ClientClosedRequestError } from "@app/lib/errors";

import { expandSecretReferencesFactory } from "./secret-reference-fns";

vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("../project-folder-grant/project-folder-grant-fns", () => ({ isCrossProjectEnabled: vi.fn() }));

type Args = Parameters<typeof expandSecretReferencesFactory>[0];

const makeDALs = () => {
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
  return { findBySecretPath, findByFolderId };
};

describe("expandSecretReferencesFactory", () => {
  it("should share one folder read when resolving concurrent references to the same folder", async () => {
    const { findBySecretPath, findByFolderId } = makeDALs();
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

  it("does no lookups once the signal has already aborted", async () => {
    const { findBySecretPath, findByFolderId } = makeDALs();
    const controller = new AbortController();
    controller.abort();
    const { expandSecretReferences } = expandSecretReferencesFactory({
      projectId: "project",
      folderDAL: { findBySecretPath },
      secretDAL: { findByFolderId },
      decryptSecretValue: (value) => value?.toString(),
      canExpandValue: vi.fn(() => true),
      abortSignal: controller.signal
    });

    await expect(
      expandSecretReferences({ secretKey: "KEY", value: `\${SOURCE}`, environment: "prod", secretPath: "/shared" })
    ).rejects.toBeInstanceOf(ClientClosedRequestError);
    expect(findBySecretPath).not.toHaveBeenCalled();
    expect(findByFolderId).not.toHaveBeenCalled();
  });

  it("stops before the next reference lookup when the signal aborts mid-expansion", async () => {
    const { findBySecretPath, findByFolderId } = makeDALs();
    const controller = new AbortController();
    findBySecretPath.mockImplementationOnce(async () => {
      controller.abort();
      return { id: "folder" } as Awaited<ReturnType<Args["folderDAL"]["findBySecretPath"]>>;
    });
    const { expandSecretReferences } = expandSecretReferencesFactory({
      projectId: "project",
      folderDAL: { findBySecretPath },
      secretDAL: { findByFolderId },
      decryptSecretValue: (value) => value?.toString(),
      canExpandValue: vi.fn(() => true),
      abortSignal: controller.signal
    });

    await expect(
      expandSecretReferences({
        secretKey: "KEY",
        value: `\${prod.a.SOURCE} \${prod.b.SOURCE}`,
        environment: "prod",
        secretPath: "/shared"
      })
    ).rejects.toBeInstanceOf(ClientClosedRequestError);
    // Only the read of the secret being expanded ran; neither referenced folder was loaded.
    expect(findBySecretPath).toHaveBeenCalledOnce();
    expect(findBySecretPath).toHaveBeenCalledWith("project", "prod", "/shared", undefined);
  });
});
