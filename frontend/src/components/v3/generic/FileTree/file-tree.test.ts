import { describe, expect, test } from "vitest";

import { buildFileTree, getAncestorFolders } from "./file-tree";

describe("buildFileTree", () => {
  test("nests files in folders, folders first and files in the given order", () => {
    expect(
      buildFileTree(["SKILL.md", "scripts/check.sh", "docs/b.md", "docs/a.md", "README.md"])
    ).toEqual([
      {
        type: "folder",
        name: "docs",
        path: "docs",
        children: [
          { type: "file", name: "b.md", path: "docs/b.md" },
          { type: "file", name: "a.md", path: "docs/a.md" }
        ]
      },
      {
        type: "folder",
        name: "scripts",
        path: "scripts",
        children: [{ type: "file", name: "check.sh", path: "scripts/check.sh" }]
      },
      { type: "file", name: "SKILL.md", path: "SKILL.md" },
      { type: "file", name: "README.md", path: "README.md" }
    ]);
  });

  test("shares folders between deep paths", () => {
    const [folder] = buildFileTree(["a/b/one.txt", "a/two.txt", "a/b/c/three.txt"]);
    expect(folder).toMatchObject({ path: "a" });
    expect(folder.type === "folder" && folder.children.map((node) => node.path)).toEqual([
      "a/b",
      "a/two.txt"
    ]);
  });

  test("adds empty folders, nested or not", () => {
    const tree = buildFileTree(["a/one.txt"], ["a/empty", "top"]);
    expect(tree.map((node) => node.path)).toEqual(["a", "top"]);
    const [folder] = tree;
    expect(folder.type === "folder" && folder.children.map((node) => node.path)).toEqual([
      "a/empty",
      "a/one.txt"
    ]);
  });

  test("returns nothing for no paths", () => {
    expect(buildFileTree([])).toEqual([]);
  });
});

describe("getAncestorFolders", () => {
  test("lists each containing folder, outermost first", () => {
    expect(getAncestorFolders("a/b/c.txt")).toEqual(["a", "a/b"]);
    expect(getAncestorFolders("top.txt")).toEqual([]);
  });
});
