import { describe, expect, it, vi } from "vitest";

import { ClientClosedRequestError } from "@app/lib/errors";

import {
  assertSecretReferencesWithinLimit,
  expandSecretReferencesFactory,
  getAllSecretReferences
} from "./secret-reference-fns";

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

  it("lists a reference repeated in one value once", () => {
    expect(getAllSecretReferences(`\${KEY}\${KEY} \${dev.a.KEY}\${dev.a.KEY}`)).toEqual({
      localReferences: ["KEY"],
      nestedReferences: [{ environment: "dev", secretPath: "/a", secretKey: "KEY" }]
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

describe("expandSecretReferencesFactory onSecretExpanded", () => {
  const row = (id: string, key: string, value: string, userId: string | null = null) => ({
    id,
    _id: id,
    key,
    version: 1,
    type: userId ? "personal" : "shared",
    folderId: "folder",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    encryptedValue: Buffer.from(value),
    tags: [],
    secretMetadata: [],
    userId
  });
  const expand = async (
    rows: ReturnType<typeof row>[],
    value: string,
    {
      userId,
      forbidden,
      reported = []
    }: { userId?: string; forbidden?: string; reported?: { secretKey: string; referencedSecretIds: string[] }[] } = {}
  ) => {
    const { findBySecretPath } = makeDALs();
    const { expandSecretReferences } = expandSecretReferencesFactory({
      projectId: "project",
      folderDAL: { findBySecretPath },
      secretDAL: { findByFolderId: vi.fn<Args["secretDAL"]["findByFolderId"]>().mockResolvedValue(rows) },
      decryptSecretValue: (encrypted) => encrypted?.toString(),
      canExpandValue: vi.fn((_environment: string, _secretPath: string, secretKey: string) => secretKey !== forbidden),
      userId,
      onSecretExpanded: ({ secretKey }, referencedSecretIds) => reported.push({ secretKey, referencedSecretIds })
    });
    const expanded = await expandSecretReferences({ secretKey: "URL", value, environment: "prod", secretPath: "/" });
    return { expanded, reported };
  };

  it("reports the secret each reference resolved to, the reader's own override included", async () => {
    const rows = [row("shared-db", "DB_PASSWORD", "shared"), row("alice-db", "DB_PASSWORD", "mine", "alice")];
    const asAlice = await expand(rows, `postgres://\${DB_PASSWORD}@db`, { userId: "alice" });
    expect(asAlice).toEqual({
      expanded: "postgres://mine@db",
      reported: [{ secretKey: "URL", referencedSecretIds: ["alice-db"] }]
    });
    const shared = await expand(rows.slice(0, 1), `postgres://\${DB_PASSWORD}@db`);
    expect(shared.reported).toEqual([{ secretKey: "URL", referencedSecretIds: ["shared-db"] }]);
  });

  it("reports nothing for an expansion that fails part way", async () => {
    const rows = [row("readable", "READABLE", "ok"), row("forbidden", "FORBIDDEN", "no")];
    const reported: { secretKey: string; referencedSecretIds: string[] }[] = [];
    await expect(expand(rows, `\${READABLE}\${FORBIDDEN}`, { forbidden: "FORBIDDEN", reported })).rejects.toThrow();
    expect(reported).toEqual([]);
  });
});

describe("expandSecretReferencesFactory expansion", () => {
  // Folders are keyed "<environment>:<path>" and map secret names to plain values.
  const expanderFor = (
    folders: Record<string, Record<string, string>>,
    shouldStackTrace = false,
    canExpandValue: Args["canExpandValue"] = () => true
  ) => {
    const findBySecretPath = vi.fn(async (_projectId: string, environment: string, secretPath: string) =>
      folders[`${environment}:${secretPath}`] ? { id: `${environment}:${secretPath}` } : undefined
    ) as unknown as Args["folderDAL"]["findBySecretPath"];
    const findByFolderId = vi.fn(async ({ folderId }: { folderId: string }) =>
      Object.entries(folders[folderId] ?? {}).map(([key, value]) => ({
        id: `${folderId}:${key}`,
        key,
        userId: null,
        encryptedValue: Buffer.from(value),
        tags: []
      }))
    ) as unknown as Args["secretDAL"]["findByFolderId"];
    const factory = expandSecretReferencesFactory({
      projectId: "project",
      folderDAL: { findBySecretPath },
      secretDAL: { findByFolderId },
      decryptSecretValue: (value) => value?.toString(),
      canExpandValue
    });
    const expand = (secretKey: string, environment = "dev", secretPath = "/") =>
      shouldStackTrace
        ? factory.getExpandedSecretStackTrace({
            secretKey,
            value: folders[`${environment}:${secretPath}`][secretKey],
            environment,
            secretPath
          })
        : factory.expandSecretReferences({
            secretKey,
            value: folders[`${environment}:${secretPath}`][secretKey],
            environment,
            secretPath
          });
    return { expand, findByFolderId };
  };

  it("expands every occurrence of a reference and every distinct reference in one value", async () => {
    const { expand } = expanderFor({ "dev:/": { HOST: "db", PORT: "5432", URL: `\${HOST}:\${PORT}/\${HOST}` } });
    expect(await expand("URL")).toBe("db:5432/db");
  });

  it("resolves a referenced secret's own references in that secret's environment and path", async () => {
    const { expand } = expanderFor({
      "dev:/": { NAME: "dev-name", URL: `\${prod.x.HOST} \${NAME}` },
      "prod:/x": { NAME: "prod-name", HOST: `\${NAME}` }
    });
    expect(await expand("URL")).toBe("prod-name dev-name");
  });

  it("inserts replacement-pattern characters from a referenced value literally", async () => {
    const { expand } = expanderFor({ "dev:/": { SPECIAL: "$& $1 $$ $`", URL: `<\${SPECIAL}>` } });
    expect(await expand("URL")).toBe("<$& $1 $$ $`>");
  });

  it("answers a circular pair with a literal reference rather than looping", async () => {
    const { expand } = expanderFor({ "dev:/": { A: `\${B}`, B: `\${A}` } });
    expect(await expand("A")).toBe(`\${B}`);
  });

  it("stops expanding a chain longer than the reference depth limit", async () => {
    const chain = (prefix: string, length: number) =>
      Object.fromEntries(
        Array.from({ length }, (_, i) => [`${prefix}${i + 1}`, i + 1 === length ? "end" : `\${${prefix}${i + 2}}`])
      );
    const { expand } = expanderFor({ "dev:/": { ...chain("WITHIN", 12), ...chain("BEYOND", 13) } });
    expect(await expand("WITHIN1")).toBe("end");
    expect(await expand("BEYOND1")).toBe(`\${BEYOND13}`);
  });

  it("expands a secret repeated through another repeated secret once per distinct reference", async () => {
    const { expand, findByFolderId } = expanderFor({
      "dev:/": { C: "x", B: `\${C}`.repeat(1000), A: `\${B}`.repeat(1000) }
    });
    expect(await expand("A")).toBe("x".repeat(1_000_000));
    expect(findByFolderId).toHaveBeenCalledOnce();
  });

  it("refuses a secret whose references fan out to more than the reference limit", async () => {
    // Every level references the three secrets of the next one, so the tree holds 3 + 9 + ... + 3^10 references.
    const levels: Record<string, string> = {};
    for (let level = 0; level <= 10; level += 1) {
      const next = ["a", "b", "c"].map((name) => `\${L${level + 1}${name}}`).join("");
      for (const name of ["a", "b", "c"]) levels[`L${level}${name}`] = level === 10 ? "end" : next;
    }
    const { expand } = expanderFor({ "dev:/": levels });
    await expect(expand("L0a")).rejects.toThrow(
      "Unable to expand the references in secret 'L0a' in environment 'dev' at path '/' because it leads to more than 1,000 references"
    );
  });

  it("refuses a secret whose references fan out through each other in a cycle", async () => {
    const names = Array.from({ length: 12 }, (_, i) => `N${i}`);
    const everyName = names.map((name) => `\${${name}}`).join("");
    const { expand } = expanderFor({
      "dev:/": Object.fromEntries(names.map((name): [string, string] => [name, everyName]))
    });
    await expect(expand("N0")).rejects.toThrow("more than 1,000 references");
  });

  it("refuses a secret whose expanded value exceeds the character limit", async () => {
    const { expand } = expanderFor({ "dev:/": { BIG: "x".repeat(40_000), A: `\${BIG}`.repeat(300) } });
    await expect(expand("A")).rejects.toThrow("expanding it would process more than 10,485,760 characters");
  });

  it("refuses an expansion past the character limit before building it", async () => {
    // 1,000 copies of one reference to a 1,000,000-character secret would be a billion characters, past V8's
    // string limit, so building it first fails with a RangeError after allocating gigabytes.
    const { expand } = expanderFor({ "dev:/": { BIG: "x".repeat(1_000_000), A: `\${BIG}`.repeat(1000) } });
    await expect(expand("A")).rejects.toThrow("expanding it would process more than 10,485,760 characters");
  });

  it("charges a reused expansion's characters, so a warm cache does not change the outcome", async () => {
    // X costs about 6,000,000 characters to expand: it references twelve values of 1,000 references each to an
    // empty secret with a 500-character name, so the scan is long and the output empty. R adds 4,600,000 of its own.
    const empty = "E".repeat(500);
    const ys = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`Y${i}`, `\${${empty}}`.repeat(1000)]));
    const folders = {
      "dev:/": {
        [empty]: "",
        ...ys,
        X: Object.keys(ys)
          .map((key) => `\${${key}}`)
          .join(""),
        W: `\${X}`,
        R: `\${X}${"y".repeat(4_600_000)}`
      }
    };
    const cold = expanderFor(folders);
    await expect(cold.expand("R")).rejects.toThrow("10,485,760 characters");

    const warm = expanderFor(folders);
    expect(await warm.expand("W")).toBe("");
    await expect(warm.expand("R")).rejects.toThrow("10,485,760 characters");
  });

  it("does not count skipped cross-project references against the limit before resolving", async () => {
    // A spends 501 of the budget before B is scanned. B's 600 cross-project references stay literal without
    // cross-project sharing and never count, so only its HOST does and R expands.
    const missing = Array.from({ length: 500 }, (_, i) => `\${M${i}}`).join("");
    const crossProject = Array.from({ length: 600 }, (_, i) => `\${@other.dev.K${i}}`).join("");
    const { expand } = expanderFor({
      "dev:/": { HOST: "db", A: missing, B: `${crossProject}\${HOST}`, R: `\${A}\${B}` }
    });
    expect(await expand("R")).toBe(`${missing}${crossProject}db`);
  });

  it("refuses a referenced value that alone holds more references than the budget has left, before resolving them", async () => {
    const missing = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, i) => `\${${prefix}${i}}`).join("");
    const canExpandValue = vi.fn(() => true);
    const { expand } = expanderFor(
      { "dev:/": { A: missing("M", 500), B: missing("P", 600), R: `\${A}\${B}` } },
      false,
      canExpandValue
    );
    await expect(expand("R")).rejects.toThrow("because it leads to more than 1,000 references");
    // R itself, A, A's 500 references and B: none of B's references was resolved.
    expect(canExpandValue).toHaveBeenCalledTimes(503);
  });

  it("does not reuse an expansion whose depth cutoff hid a circular reference", async () => {
    // N -> a -> b -> c -> N is a cycle. Reached at depth 8 from R1, the depth limit stops at c before c's reference
    // back to N is read. Reached at depth 8 from R2, a sits above N, so N's reference to a is circular.
    const chain = (prefix: string, length: number, last: string) =>
      Object.fromEntries(
        Array.from({ length }, (_, i) => [
          `${prefix}${i + 1}`,
          i + 1 === length ? `\${${last}}` : `\${${prefix}${i + 2}}`
        ])
      );
    const folders = {
      "dev:/": {
        R1: `\${S1}`,
        ...chain("S", 7, "N"),
        R2: `\${Q1}`,
        ...chain("Q", 4, "a"),
        a: `A(\${b})`,
        b: `B(\${c})`,
        c: `C(\${N})`,
        N: `N(\${a})`
      }
    };
    const fresh = await expanderFor(folders).expand("R2");
    expect(fresh).toBe(`A(B(C(N(A(\${b})))))`);

    const warm = expanderFor(folders);
    await warm.expand("R1");
    expect(await warm.expand("R2")).toBe(fresh);
  });

  it("lists each distinct referenced secret once in the reference tree, with its own references nested", async () => {
    const { expand } = expanderFor(
      {
        "dev:/": { HOST: `\${prod.HOST}`, URL: `\${HOST}:\${prod.PORT}/\${HOST}` },
        "prod:/": { HOST: "db", PORT: "5432" }
      },
      true
    );
    const { expandedValue, stackTrace } = (await expand("URL")) as {
      expandedValue: string;
      stackTrace: { children: { key: string; environment: string; children: { key: string }[] }[] };
    };
    expect(expandedValue).toBe("db:5432/db");
    expect(
      stackTrace.children.map(({ key, environment, children }) => ({
        key,
        environment,
        children: children.map((child) => child.key)
      }))
    ).toEqual([
      { key: "HOST", environment: "dev", children: ["HOST"] },
      { key: "PORT", environment: "prod", children: [] }
    ]);
  });
});

describe("assertSecretReferencesWithinLimit", () => {
  const distinct = (count: number) => Array.from({ length: count }, (_, i) => `\${K${i}}`).join("");

  it("accepts a value with up to 100 references, counting each repeat", () => {
    expect(() =>
      assertSecretReferencesWithinLimit([
        { secretKey: "AT_LIMIT", secretValue: distinct(100) },
        { secretKey: "REPEATED", secretValue: `\${K}`.repeat(100) },
        { secretKey: "EMPTY", secretValue: undefined }
      ])
    ).not.toThrow();
  });

  it("refuses a value with more than 100 references, naming the secret", () => {
    expect(() =>
      assertSecretReferencesWithinLimit([
        { secretKey: "FINE", secretValue: "plain" },
        { secretKey: "TOO_MANY", secretValue: distinct(101) }
      ])
    ).toThrow("The value of secret 'TOO_MANY' holds more than 100 secret references");
  });

  it("counts a reference each time it repeats", () => {
    expect(() =>
      assertSecretReferencesWithinLimit([{ secretKey: "REPEATED", secretValue: `\${K}`.repeat(101) }])
    ).toThrow("The value of secret 'REPEATED' holds more than 100 secret references");
  });
});

describe("expandSecretReferencesFactory up-front refusal", () => {
  it("refuses a value holding more than 1,000 references before resolving any of them", async () => {
    const { findBySecretPath, findByFolderId } = makeDALs();
    const canExpandValue = vi.fn(() => true);
    const { expandSecretReferences } = expandSecretReferencesFactory({
      projectId: "project",
      folderDAL: { findBySecretPath },
      secretDAL: { findByFolderId },
      decryptSecretValue: (value) => value?.toString(),
      canExpandValue
    });
    const value = `\${K}`.repeat(1_001);

    await expect(
      expandSecretReferences({ secretKey: "MANY", value, environment: "prod", secretPath: "/shared" })
    ).rejects.toThrow("because the value of secret 'MANY' holds more than 1,000 references");
    // Only the permission check on the secret itself ran; no reference was resolved.
    expect(canExpandValue).toHaveBeenCalledOnce();
  });
});
