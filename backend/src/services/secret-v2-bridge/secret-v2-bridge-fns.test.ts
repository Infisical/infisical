import { beforeEach, describe, expect, test, vi } from "vitest";

import { TSecretFolders } from "@app/db/schemas";
import { logger } from "@app/lib/logger";

import { buildHierarchy, expandSecretReferencesGroupedByPath, generatePaths } from "./secret-v2-bridge-fns";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

type TPath = { path: string; folderId: string };

const folder = (id: string, name: string, parentId: string | null) =>
  ({
    id,
    name,
    parentId,
    envId: "env-1",
    version: 1,
    isReserved: false,
    createdAt: new Date(0),
    updatedAt: new Date(0)
  }) as TSecretFolders;

const ROOT = folder("root-id", "root", null);

const buildChain = (depth: number) => {
  const folders = [ROOT];
  let parent = ROOT.id;
  for (let i = 0; i < depth; i += 1) {
    const id = `d-${i}`;
    folders.push(folder(id, `level-${i}`, parent));
    parent = id;
  }
  return folders;
};

// Paths for d-0..d-(count-1) of buildChain, rooted at the environment root.
const chainPaths = (count: number): TPath[] => {
  const paths: TPath[] = [{ path: "/", folderId: ROOT.id }];
  let current = "/";
  for (let i = 0; i < count; i += 1) {
    current = `${current}/level-${i}`;
    paths.push({ path: current, folderId: `d-${i}` });
  }
  return paths;
};

// Park-Miller PRNG so the random tree is reproducible across runs.
const seededRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

const buildRandomTree = (size: number, seed: number) => {
  const rand = seededRandom(seed);
  const folders = [ROOT];
  for (let i = 0; i < size; i += 1) {
    const parent = folders[Math.floor(rand() * folders.length)];
    folders.push(folder(`r-${i}`, `n-${i}`, parent.id));
  }
  // Shuffle so sibling order comes from input order, not creation order.
  for (let i = folders.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [folders[i], folders[j]] = [folders[j], folders[i]];
  }
  return folders;
};

describe("generatePaths", () => {
  beforeEach(() => {
    vi.mocked(logger.info).mockClear();
  });

  test("returns an empty list for an environment with no folders", () => {
    expect(generatePaths(buildHierarchy([]))).toEqual([]);
  });

  test("emits the root as '/' and its descendants with a double slash", () => {
    const map = buildHierarchy([ROOT, folder("a", "a", ROOT.id), folder("b", "b", "a")]);
    expect(generatePaths(map)).toEqual([
      { path: "/", folderId: "root-id" },
      { path: "//a", folderId: "a" },
      { path: "//a/b", folderId: "b" }
    ]);
  });

  test("emits parent then subtree, in children order (depth-first pre-order)", () => {
    const map = buildHierarchy([
      ROOT,
      folder("a", "a", ROOT.id),
      folder("b", "b", ROOT.id),
      folder("a1", "a1", "a"),
      folder("b1", "b1", "b"),
      folder("a2", "a2", "a")
    ]);
    expect(generatePaths(map).map((p) => p.folderId)).toEqual(["root-id", "a", "a1", "a2", "b", "b1"]);
  });

  test("returns every folder of a wide tree in pre-order", () => {
    const width = 500;
    const grandchildren = 4;
    const folders = [ROOT];
    const expected: TPath[] = [{ path: "/", folderId: ROOT.id }];
    for (let i = 0; i < width; i += 1) {
      folders.push(folder(`c-${i}`, `child-${i}`, ROOT.id));
      expected.push({ path: `//child-${i}`, folderId: `c-${i}` });
      for (let j = 0; j < grandchildren; j += 1) {
        folders.push(folder(`g-${i}-${j}`, `grandchild-${j}`, `c-${i}`));
        expected.push({ path: `//child-${i}/grandchild-${j}`, folderId: `g-${i}-${j}` });
      }
    }

    expect(generatePaths(buildHierarchy(folders))).toEqual(expected);
    expect(logger.info).not.toHaveBeenCalled();
  });

  test("returns a deep tree within the limit in full", () => {
    expect(generatePaths(buildHierarchy(buildChain(19)))).toEqual(chainPaths(19));
    expect(logger.info).not.toHaveBeenCalled();
  });

  test("does not log when the deepest folders sit at the limit with nothing below them", () => {
    expect(generatePaths(buildHierarchy(buildChain(20)))).toEqual(chainPaths(20));
    expect(logger.info).not.toHaveBeenCalled();
  });

  test("stops at depth 20 on a tree deeper than 20 levels and logs counts, not the folder map", () => {
    const folders = buildChain(35);
    // Extra branches around the cutoff so several folders sit exactly at the limit.
    folders.push(folder("side-17", "side", "d-17"), folder("side-18", "side", "d-18"), folder("side-19", "x", "d-19"));

    const actual = generatePaths(buildHierarchy(folders));

    // Root is depth 0, so d-19 (depth 20) is the last level emitted and its children are cut.
    const ids = actual.map((p) => p.folderId);
    expect(ids).toEqual(expect.arrayContaining(["d-19", "side-17", "side-18"]));
    expect(ids).not.toContain("d-20");
    expect(ids).not.toContain("side-19");
    expect(actual).toHaveLength(1 + 20 + 2);

    // d-19 and side-18 both sit at the limit, but only d-19 has children that get skipped.
    expect(logger.info).toHaveBeenCalledTimes(1);
    const [[message]] = vi.mocked(logger.info).mock.calls as unknown as [[string]];
    expect(message).toContain("[depthLimitedFolderCount=1]");
    expect(message).toContain("[sampleFolderIds=d-19]");
    expect(message).not.toContain("level-");
    expect(message.length).toBeLessThan(500);
  });

  test("emits each reachable folder once, under its parent's path, before its own subtree", () => {
    for (const seed of [1, 7, 42, 1337]) {
      const folders = buildRandomTree(3000, seed);
      const byId = new Map(folders.map((f) => [f.id, f]));
      const paths = generatePaths(buildHierarchy(folders));

      expect(paths).toHaveLength(folders.length);
      expect(new Set(paths.map((p) => p.folderId)).size).toBe(folders.length);

      const indexById = new Map(paths.map((p, i) => [p.folderId, i]));
      const pathById = new Map(paths.map((p) => [p.folderId, p.path]));
      for (const { folderId, path } of paths) {
        const { parentId, name } = byId.get(folderId) as TSecretFolders;
        if (!parentId) {
          expect(path).toBe("/");
        } else {
          expect(path).toBe(`${pathById.get(parentId)}/${name}`);
          expect(indexById.get(parentId)).toBeLessThan(indexById.get(folderId) as number);
        }
      }
    }
  });

  test("treats top-level folders not named root as '/<name>'", () => {
    const map = buildHierarchy([folder("x", "x", null), folder("y", "y", "x"), ROOT, folder("z", "z", ROOT.id)]);
    expect(generatePaths(map)).toEqual([
      { path: "/x", folderId: "x" },
      { path: "/x/y", folderId: "y" },
      { path: "/", folderId: "root-id" },
      { path: "//z", folderId: "z" }
    ]);
  });

  test("ignores folders that are unreachable from the top level, including parent cycles", () => {
    const map = buildHierarchy([ROOT, folder("p", "p", "q"), folder("q", "q", "p")]);
    expect(generatePaths(map)).toEqual([{ path: "/", folderId: "root-id" }]);
  });

  test("honors explicit parentId, basePath and depth arguments", () => {
    const map = buildHierarchy(buildChain(30));
    // Starting at depth 5 below d-2, d-18 lands on the depth-20 limit.
    const expected: TPath[] = [];
    let current = "/base";
    for (let i = 3; i <= 18; i += 1) {
      current = `${current}/level-${i}`;
      expected.push({ path: current, folderId: `d-${i}` });
    }
    expect(generatePaths(map, "d-2", "/base", 5)).toEqual(expected);
  });
});

type TTestSecret = {
  secretKey: string;
  secretPath: string;
  secretValue: string;
  skipMultilineEncoding?: boolean | null;
};

describe("expandSecretReferencesGroupedByPath", () => {
  const makeSecret = (secretPath: string, secretKey: string, secretValue = `ref-${secretKey}`): TTestSecret => ({
    secretPath,
    secretKey,
    secretValue
  });

  test("expands every secret in place and reports no errors when all expansions succeed", async () => {
    const secrets = [makeSecret("/a", "A1"), makeSecret("/b", "B1"), makeSecret("/a", "A2")];
    const expand = vi.fn(async ({ secretKey }: { secretKey: string }) => `expanded-${secretKey}`);

    const errors = await expandSecretReferencesGroupedByPath({
      secrets,
      environment: "dev",
      expandSecretReferences: expand
    });

    expect(errors).toEqual([]);
    expect(secrets.map((s) => s.secretValue)).toEqual(["expanded-A1", "expanded-B1", "expanded-A2"]);
    expect(expand).toHaveBeenCalledWith(
      expect.objectContaining({ secretKey: "B1", secretPath: "/b", environment: "dev", value: "ref-B1" })
    );
  });

  test("stores an empty string when the expander returns undefined", async () => {
    const secrets = [makeSecret("/a", "A1")];
    await expandSecretReferencesGroupedByPath({
      secrets,
      environment: "dev",
      expandSecretReferences: async () => undefined
    });
    expect(secrets[0].secretValue).toBe("");
  });

  test("attributes each rejection to the path of the secret that failed", async () => {
    // Interleaved paths so group order differs from input order.
    const secrets = [
      makeSecret("/a", "A1"),
      makeSecret("/b", "B1"),
      makeSecret("/c", "C1"),
      makeSecret("/a", "A2"),
      makeSecret("/c", "C2"),
      makeSecret("/b", "B2")
    ];
    const failing = new Set(["B2", "C1", "C2"]);

    const errors = await expandSecretReferencesGroupedByPath({
      secrets,
      environment: "dev",
      expandSecretReferences: async ({ secretKey, secretPath }) => {
        if (failing.has(secretKey)) throw new Error(`cannot expand ${secretKey} in ${secretPath}`);
        return `ok-${secretKey}`;
      }
    });

    expect(errors).toEqual([
      { path: "/b", error: "cannot expand B2 in /b" },
      { path: "/c", error: "cannot expand C1 in /c" },
      { path: "/c", error: "cannot expand C2 in /c" }
    ]);
    for (const error of errors) {
      const [, key, pathInMessage] = /cannot expand (\S+) in (\S+)/.exec(error.error) ?? [];
      expect(pathInMessage).toBe(error.path);
      expect(secrets.find((s) => s.secretKey === key)?.secretPath).toBe(error.path);
    }

    expect(secrets.find((s) => s.secretKey === "A1")?.secretValue).toBe("ok-A1");
    expect(secrets.find((s) => s.secretKey === "B2")?.secretValue).toBe("ref-B2");
  });

  test("keeps the mapping correct across many paths", async () => {
    const pathCount = 2000;
    const secrets = Array.from({ length: pathCount }, (_, i) => makeSecret(`/p-${i}`, `K${i}`));

    const errors = await expandSecretReferencesGroupedByPath({
      secrets,
      environment: "dev",
      expandSecretReferences: async ({ secretKey, secretPath }) => {
        if (Number(secretKey.slice(1)) % 7 === 0) throw new Error(`fail:${secretPath}`);
        return secretKey;
      }
    });

    expect(errors).toHaveLength(Math.ceil(pathCount / 7));
    for (const error of errors) {
      expect(error.error).toBe(`fail:${error.path}`);
    }
  });
});
