import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { ClientClosedRequestError } from "@app/lib/errors";

import { expandSecretReferencesFactory, getAllSecretReferences } from "./secret-reference-fns";

vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("../project-folder-grant/project-folder-grant-fns", () => ({ isCrossProjectEnabled: vi.fn() }));

type Args = Parameters<typeof expandSecretReferencesFactory>[0];

const makeDALs = (key = "SOURCE") => {
  const findBySecretPath = vi
    .fn<Args["folderDAL"]["findBySecretPath"]>()
    .mockResolvedValue({ id: "folder" } as Awaited<ReturnType<Args["folderDAL"]["findBySecretPath"]>>);
  const findByFolderId = vi.fn<Args["secretDAL"]["findByFolderId"]>().mockResolvedValue([
    {
      id: "secret",
      _id: "secret",
      key,
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
    // The folder lookup for the secret being expanded ran; its secrets and the referenced folders were never loaded.
    expect(findBySecretPath).toHaveBeenCalledOnce();
    expect(findBySecretPath).toHaveBeenCalledWith("project", "prod", "/shared", undefined);
    expect(findByFolderId).not.toHaveBeenCalled();
  });

  it("does not decrypt a folder whose secrets arrive after the signal aborted", async () => {
    const { findBySecretPath, findByFolderId } = makeDALs();
    const controller = new AbortController();
    const defaultRows = await findByFolderId({ folderId: "folder" });
    findByFolderId.mockClear();
    findByFolderId.mockImplementationOnce(async () => {
      controller.abort();
      return defaultRows;
    });
    const decryptSecretValue = vi.fn((value?: Buffer | null) => value?.toString());
    const { expandSecretReferences } = expandSecretReferencesFactory({
      projectId: "project",
      folderDAL: { findBySecretPath },
      secretDAL: { findByFolderId },
      decryptSecretValue,
      canExpandValue: vi.fn(() => true),
      abortSignal: controller.signal
    });

    const expansions = Array.from({ length: 5 }, (_, index) =>
      expandSecretReferences({
        secretKey: `KEY_${index}`,
        value: `\${SOURCE}`,
        environment: "prod",
        secretPath: "/shared"
      })
    );

    // Every expansion shares the one folder load, so all of them stop instead of seeing an empty folder.
    const results = await Promise.allSettled(expansions);
    expect(results.every((r) => r.status === "rejected" && r.reason instanceof ClientClosedRequestError)).toBe(true);
    expect(findByFolderId).toHaveBeenCalledOnce();
    expect(decryptSecretValue).not.toHaveBeenCalled();
  });

  it("resolves references to a secret whose name contains a space", async () => {
    const { findBySecretPath, findByFolderId } = makeDALs("My Secret");
    const { expandSecretReferences } = expandSecretReferencesFactory({
      projectId: "project",
      folderDAL: { findBySecretPath },
      secretDAL: { findByFolderId },
      decryptSecretValue: (value) => value?.toString(),
      canExpandValue: vi.fn(() => true)
    });
    const expand = (value: string) =>
      expandSecretReferences({ secretKey: "KEY", value, environment: "prod", secretPath: "/shared" });

    expect(await expand(`\${My Secret}`)).toBe("resolved");
    expect(await expand(`\${prod.shared.My Secret}`)).toBe("resolved");
    expect(await expand(`user=\${My Secret};`)).toBe("user=resolved;");
  });

  it("leaves a reference padded with spaces literal without looking anything up", async () => {
    const { findBySecretPath, findByFolderId } = makeDALs("My Secret");
    const { expandSecretReferences } = expandSecretReferencesFactory({
      projectId: "project",
      folderDAL: { findBySecretPath },
      secretDAL: { findByFolderId },
      decryptSecretValue: (value) => value?.toString(),
      canExpandValue: vi.fn(() => true)
    });

    const value = `\${ My Secret }`;
    expect(await expandSecretReferences({ secretKey: "KEY", value, environment: "prod", secretPath: "/shared" })).toBe(
      value
    );
    expect(findBySecretPath).not.toHaveBeenCalled();
    expect(findByFolderId).not.toHaveBeenCalled();
  });
});

describe("getAllSecretReferences", () => {
  it("parses the reference forms that predate spaces in secret names the same way", () => {
    expect(getAllSecretReferences(`\${KEY} \${dev.KEY} \${dev.a.b.KEY} \${@proj.dev.a.KEY}`)).toEqual({
      localReferences: ["KEY"],
      nestedReferences: [
        { environment: "dev", secretPath: "/", secretKey: "KEY" },
        { environment: "dev", secretPath: "/a/b", secretKey: "KEY" },
        { targetProjectSlug: "proj", environment: "dev", secretPath: "/a", secretKey: "KEY" }
      ]
    });
  });

  it("accepts spaces inside the secret name of local, nested, and cross-project references", () => {
    expect(
      getAllSecretReferences(`\${My Secret} \${My  Secret} \${dev.a.My Secret} \${@proj.dev.My Secret Name}`)
    ).toEqual({
      localReferences: ["My Secret", "My  Secret"],
      nestedReferences: [
        { environment: "dev", secretPath: "/a", secretKey: "My Secret" },
        { targetProjectSlug: "proj", environment: "dev", secretPath: "/", secretKey: "My Secret Name" }
      ]
    });
  });

  it.each([
    [`\${ KEY }`],
    [`\${ KEY}`],
    [`\${KEY }`],
    [`\${my env.KEY}`],
    [`\${dev.my folder.KEY}`],
    [`\${@my proj.dev.KEY}`],
    [`\${{ secrets.KEY }}`],
    [`\${a + b}`]
  ])("does not treat %s as a reference", (value) => {
    expect(getAllSecretReferences(value)).toEqual({ localReferences: [], nestedReferences: [] });
  });
});

describe("expandSecretReferencesFactory with references across folders", () => {
  const folderSecrets: Record<string, Record<string, string>> = {
    [`prod:${path.join("/", "app")}`]: { USER: "app-user" },
    [`prod:${path.join("/", "db")}`]: { URL: `db://\${USER}`, USER: "db-user" },
    [`prod:${path.join("/", "cache")}`]: { URL: `cache://\${USER}`, USER: "cache-user" }
  };

  const makeFactory = () => {
    const findBySecretPath = vi
      .fn<Args["folderDAL"]["findBySecretPath"]>()
      .mockImplementation(async (_projectId, environment, secretPath) =>
        folderSecrets[`${environment}:${secretPath}`]
          ? ({ id: `${environment}:${secretPath}` } as Awaited<ReturnType<Args["folderDAL"]["findBySecretPath"]>>)
          : undefined
      );
    const findByFolderId = vi.fn<Args["secretDAL"]["findByFolderId"]>().mockImplementation(async ({ folderId }) =>
      Object.entries(folderSecrets[folderId] ?? {}).map(
        ([key, value]) =>
          ({
            key,
            encryptedValue: Buffer.from(value),
            tags: [],
            userId: null
          }) as unknown as Awaited<ReturnType<Args["secretDAL"]["findByFolderId"]>>[number]
      )
    );
    return expandSecretReferencesFactory({
      projectId: "project",
      folderDAL: { findBySecretPath },
      secretDAL: { findByFolderId },
      decryptSecretValue: (value) => value?.toString(),
      canExpandValue: vi.fn(() => true)
    });
  };

  const expandInApp = (value: string) =>
    makeFactory().expandSecretReferences({
      secretKey: "ROOT",
      value,
      environment: "prod",
      secretPath: path.join("/", "app")
    });

  it("resolves a relative reference inside each referenced secret against that secret's own folder", async () => {
    expect(await expandInApp(`\${prod.db.URL} \${prod.cache.URL}`)).toBe("db://db-user cache://cache-user");
  });

  it("does not resolve a nested relative reference against the folder of the secret being read", async () => {
    expect(await expandInApp(`\${prod.db.URL} \${USER}`)).toBe("db://db-user app-user");
    expect(await expandInApp(`\${USER} \${prod.db.URL}`)).toBe("app-user db://db-user");
  });

  it("returns the same value from the reference tree", async () => {
    const { expandedValue } = await makeFactory().getExpandedSecretStackTrace({
      secretKey: "ROOT",
      value: `\${prod.db.URL} \${prod.cache.URL}`,
      environment: "prod",
      secretPath: path.join("/", "app")
    });
    expect(expandedValue).toBe("db://db-user cache://cache-user");
  });
});
