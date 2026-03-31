import { TSecretFolders } from "@app/db/schemas";

import {
  buildChildrenMap,
  buildFolderIdMap,
  buildFolderPath,
  resolveClosestFolder,
  resolvePathToFolder
} from "./secret-folder-fns";

const makeFolder = (id: string, name: string, parentId: string | null, envId: string = "env-1"): TSecretFolders => ({
  id,
  name,
  parentId,
  envId,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  isReserved: false,
  description: null,
  lastSecretModified: null
});

// Reusable folder tree fixture:
//
//  root (parentId=null)
//  ├── folder-a
//  │   ├── folder-b
//  │   │   └── folder-c
//  │   └── folder-d
//  └── folder-e
//
const root = makeFolder("root-id", "root", null);
const folderA = makeFolder("a-id", "folder-a", "root-id");
const folderB = makeFolder("b-id", "folder-b", "a-id");
const folderC = makeFolder("c-id", "folder-c", "b-id");
const folderD = makeFolder("d-id", "folder-d", "a-id");
const folderE = makeFolder("e-id", "folder-e", "root-id");

const allFolders = [root, folderA, folderB, folderC, folderD, folderE];

describe("buildFolderIdMap", () => {
  test("builds a map keyed by folder id", () => {
    const map = buildFolderIdMap(allFolders);
    expect(Object.keys(map)).toHaveLength(6);
    expect(map["root-id"]).toBe(root);
    expect(map["a-id"]).toBe(folderA);
    expect(map["c-id"]).toBe(folderC);
  });

  test("returns empty map for empty input", () => {
    const map = buildFolderIdMap([]);
    expect(Object.keys(map)).toHaveLength(0);
  });
});

describe("buildChildrenMap", () => {
  test("groups folders by parentId", () => {
    const map = buildChildrenMap(allFolders);
    // root has parentId=null -> key "null"
    expect(map.null).toHaveLength(1);
    expect(map.null[0]).toBe(root);

    // root's children
    expect(map["root-id"]).toHaveLength(2);
    expect(map["root-id"].map((f) => f.name).sort()).toEqual(["folder-a", "folder-e"]);

    // folder-a's children
    expect(map["a-id"]).toHaveLength(2);
    expect(map["a-id"].map((f) => f.name).sort()).toEqual(["folder-b", "folder-d"]);

    // folder-b has one child
    expect(map["b-id"]).toHaveLength(1);
    expect(map["b-id"][0].name).toBe("folder-c");

    // leaf folders have no children entries
    expect(map["c-id"]).toBeUndefined();
    expect(map["d-id"]).toBeUndefined();
    expect(map["e-id"]).toBeUndefined();
  });

  test("returns map with no entries for empty input", () => {
    const map = buildChildrenMap([]);
    expect(Object.keys(map)).toHaveLength(0);
  });
});

describe("buildFolderPath", () => {
  const idMap = buildFolderIdMap(allFolders);

  test("returns '/' for root folder", () => {
    expect(buildFolderPath(root, idMap)).toBe("/");
  });

  test("returns correct path for first-level folder", () => {
    expect(buildFolderPath(folderA, idMap)).toBe("/folder-a");
    expect(buildFolderPath(folderE, idMap)).toBe("/folder-e");
  });

  test("returns correct path for deeply nested folder", () => {
    expect(buildFolderPath(folderC, idMap)).toBe("/folder-a/folder-b/folder-c");
  });

  test("returns correct path for second-level folder", () => {
    expect(buildFolderPath(folderB, idMap)).toBe("/folder-a/folder-b");
  });

  test("returns correct path for sibling folder", () => {
    expect(buildFolderPath(folderD, idMap)).toBe("/folder-a/folder-d");
  });

  test("throws when depth exceeds 20", () => {
    // Create a chain of 22 folders (root + 21 children)
    const deepFolders: TSecretFolders[] = [makeFolder("deep-0", "root", null)];
    // eslint-disable-next-line no-plusplus
    for (let i = 1; i <= 22; i++) {
      deepFolders.push(makeFolder(`deep-${i}`, `level${i}`, `deep-${i - 1}`));
    }
    const deepMap = buildFolderIdMap(deepFolders);
    const leaf = deepFolders[deepFolders.length - 1];

    expect(() => buildFolderPath(leaf, deepMap)).toThrow("Maximum folder depth of 20 exceeded");
  });
});

describe("resolvePathToFolder", () => {
  const childrenMap = buildChildrenMap(allFolders);

  test("returns root for empty path segments (path '/')", () => {
    const result = resolvePathToFolder(childrenMap, []);
    expect(result).toBe(root);
  });

  test("resolves first-level path", () => {
    const result = resolvePathToFolder(childrenMap, ["folder-a"]);
    expect(result).toBe(folderA);
  });

  test("resolves deeply nested path", () => {
    const result = resolvePathToFolder(childrenMap, ["folder-a", "folder-b", "folder-c"]);
    expect(result).toBe(folderC);
  });

  test("resolves sibling path", () => {
    const result = resolvePathToFolder(childrenMap, ["folder-a", "folder-d"]);
    expect(result).toBe(folderD);
  });

  test("resolves second top-level folder", () => {
    const result = resolvePathToFolder(childrenMap, ["folder-e"]);
    expect(result).toBe(folderE);
  });

  test("returns undefined for nonexistent first segment", () => {
    const result = resolvePathToFolder(childrenMap, ["nonexistent"]);
    expect(result).toBeUndefined();
  });

  test("returns undefined for nonexistent deep segment", () => {
    const result = resolvePathToFolder(childrenMap, ["folder-a", "nonexistent"]);
    expect(result).toBeUndefined();
  });

  test("returns undefined for partially valid path with extra segment", () => {
    const result = resolvePathToFolder(childrenMap, ["folder-a", "folder-b", "folder-c", "extra"]);
    expect(result).toBeUndefined();
  });

  test("returns undefined when no root folder exists", () => {
    const noRootMap = buildChildrenMap([folderA, folderB]);
    const result = resolvePathToFolder(noRootMap, []);
    expect(result).toBeUndefined();
  });

  test("returns undefined for empty children map", () => {
    const result = resolvePathToFolder({}, ["folder-a"]);
    expect(result).toBeUndefined();
  });
});

describe("resolveClosestFolder", () => {
  const childrenMap = buildChildrenMap(allFolders);

  test("returns root for empty path segments (path '/')", () => {
    const result = resolveClosestFolder(childrenMap, []);
    expect(result).toBe(root);
  });

  test("resolves exact match at first level", () => {
    const result = resolveClosestFolder(childrenMap, ["folder-a"]);
    expect(result).toBe(folderA);
  });

  test("resolves exact match at deep level", () => {
    const result = resolveClosestFolder(childrenMap, ["folder-a", "folder-b", "folder-c"]);
    expect(result).toBe(folderC);
  });

  test("returns root when first segment doesn't match", () => {
    const result = resolveClosestFolder(childrenMap, ["nonexistent"]);
    expect(result).toBe(root);
  });

  test("returns deepest matching folder when path partially exists", () => {
    const result = resolveClosestFolder(childrenMap, ["folder-a", "nonexistent"]);
    expect(result).toBe(folderA);
  });

  test("returns deepest matching folder for longer nonexistent path", () => {
    const result = resolveClosestFolder(childrenMap, ["folder-a", "folder-b", "nonexistent", "deep"]);
    expect(result).toBe(folderB);
  });

  test("returns leaf folder even with extra trailing segments", () => {
    const result = resolveClosestFolder(childrenMap, ["folder-a", "folder-b", "folder-c", "extra"]);
    expect(result).toBe(folderC);
  });

  test("returns undefined when no root folder exists", () => {
    const noRootMap = buildChildrenMap([folderA, folderB]);
    const result = resolveClosestFolder(noRootMap, ["folder-a"]);
    expect(result).toBeUndefined();
  });
});

describe("multi-environment folder resolution", () => {
  // Simulate two environments sharing the same folder names but different IDs
  const env1Root = makeFolder("env1-root", "root", null, "env-1");
  const env1FolderA = makeFolder("env1-a", "shared-name", "env1-root", "env-1");

  const env2Root = makeFolder("env2-root", "root", null, "env-2");
  const env2FolderA = makeFolder("env2-a", "shared-name", "env2-root", "env-2");

  test("resolves paths independently per environment", () => {
    const env1Map = buildChildrenMap([env1Root, env1FolderA]);
    const env2Map = buildChildrenMap([env2Root, env2FolderA]);

    const result1 = resolvePathToFolder(env1Map, ["shared-name"]);
    const result2 = resolvePathToFolder(env2Map, ["shared-name"]);

    expect(result1?.id).toBe("env1-a");
    expect(result2?.id).toBe("env2-a");
    expect(result1?.id).not.toBe(result2?.id);
  });

  test("buildFolderPath works per environment", () => {
    const env1IdMap = buildFolderIdMap([env1Root, env1FolderA]);
    const env2IdMap = buildFolderIdMap([env2Root, env2FolderA]);

    expect(buildFolderPath(env1FolderA, env1IdMap)).toBe("/shared-name");
    expect(buildFolderPath(env2FolderA, env2IdMap)).toBe("/shared-name");
  });
});

describe("edge cases", () => {
  test("single root folder with no children", () => {
    const onlyRoot = makeFolder("only-root", "root", null);
    const childrenMap = buildChildrenMap([onlyRoot]);

    expect(resolvePathToFolder(childrenMap, [])).toBe(onlyRoot);
    expect(resolvePathToFolder(childrenMap, ["anything"])).toBeUndefined();
    expect(resolveClosestFolder(childrenMap, [])).toBe(onlyRoot);
    expect(resolveClosestFolder(childrenMap, ["anything"])).toBe(onlyRoot);
  });

  test("deeply nested chain (10 levels)", () => {
    const folders: TSecretFolders[] = [makeFolder("chain-0", "root", null)];
    const segments: string[] = [];
    // eslint-disable-next-line no-plusplus
    for (let i = 1; i <= 10; i++) {
      const name = `depth-${i}`;
      folders.push(makeFolder(`chain-${i}`, name, `chain-${i - 1}`));
      segments.push(name);
    }

    const childrenMap = buildChildrenMap(folders);
    const idMap = buildFolderIdMap(folders);

    // resolvePathToFolder should reach the deepest folder
    const deepest = resolvePathToFolder(childrenMap, segments);
    expect(deepest?.id).toBe("chain-10");
    expect(deepest?.name).toBe("depth-10");

    // buildFolderPath should produce the full path
    const path = buildFolderPath(folders[10], idMap);
    expect(path).toBe("/depth-1/depth-2/depth-3/depth-4/depth-5/depth-6/depth-7/depth-8/depth-9/depth-10");

    // Partial path should resolve correctly
    const partial = resolvePathToFolder(childrenMap, segments.slice(0, 5));
    expect(partial?.id).toBe("chain-5");
  });

  test("folders with similar name prefixes", () => {
    const similarRoot = makeFolder("sim-root", "root", null);
    const folderProd = makeFolder("sim-prod", "prod", "sim-root");
    const folderProdDb = makeFolder("sim-prod-db", "prod-db", "sim-root");
    const folderProduction = makeFolder("sim-production", "production", "sim-root");

    const childrenMap = buildChildrenMap([similarRoot, folderProd, folderProdDb, folderProduction]);

    expect(resolvePathToFolder(childrenMap, ["prod"])?.id).toBe("sim-prod");
    expect(resolvePathToFolder(childrenMap, ["prod-db"])?.id).toBe("sim-prod-db");
    expect(resolvePathToFolder(childrenMap, ["production"])?.id).toBe("sim-production");
    // Exact match required — no prefix matching
    expect(resolvePathToFolder(childrenMap, ["pro"])).toBeUndefined();
  });

  test("multiple root folders — picks the first one with parentId=null", () => {
    const firstRoot = makeFolder("first-root", "root", null);
    const secondRoot = makeFolder("second-root", "also-root", null);
    const child = makeFolder("child-of-first", "child", "first-root");

    const childrenMap = buildChildrenMap([firstRoot, secondRoot, child]);

    // First entry in the null key wins — doesn't depend on name
    expect(resolvePathToFolder(childrenMap, [])?.id).toBe("first-root");
    expect(resolvePathToFolder(childrenMap, ["child"])?.id).toBe("child-of-first");
  });

  test("root folder does not need to be named 'root'", () => {
    const customRoot = makeFolder("custom-root", "my-custom-root-name", null);
    const child = makeFolder("child-1", "folder-a", "custom-root");

    const childrenMap = buildChildrenMap([customRoot, child]);

    expect(resolvePathToFolder(childrenMap, [])?.id).toBe("custom-root");
    expect(resolvePathToFolder(childrenMap, ["folder-a"])?.id).toBe("child-1");
    expect(resolveClosestFolder(childrenMap, [])?.id).toBe("custom-root");
    expect(resolveClosestFolder(childrenMap, ["folder-a"])?.id).toBe("child-1");
    expect(resolveClosestFolder(childrenMap, ["nonexistent"])?.id).toBe("custom-root");
  });
});
