import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, test } from "vitest";

import {
  buildDiffRows,
  buildSkillZip,
  bytesToBase64,
  carrySkillFileModes,
  countLineChanges,
  decodeSkillFile,
  formatSkillHeaderValue,
  fromDraftFiles,
  getChangedSkillPaths,
  getReservedSkillNameMessage,
  getSkillBaseName,
  getSkillEntryNameError,
  getSkillFileChanges,
  getSkillFolders,
  getSkillHeaderError,
  getSkillHeaderText,
  getSkillParentPath,
  getSkillPathError,
  isReservedSkillName,
  joinSkillPath,
  newDraftFile,
  normalizeSkillPath,
  parseSkillHeader,
  readSkillUpload,
  removeSkillPath,
  renameSkillFolders,
  renameSkillPaths,
  replaceSkillEntryFile,
  setSkillHeaderValue,
  SkillPackageError,
  sortSkillFiles,
  splitFrontmatter,
  toDraftFiles,
  toSkillFile
} from "./agentVaultSkills";

const zipFile = (entries: Record<string, Uint8Array>, name = "skill.zip") =>
  new File([zipSync(entries)], name);

const decoded = (files: Awaited<ReturnType<typeof readSkillUpload>>) =>
  Object.fromEntries(files.map((file) => [file.path, decodeSkillFile(file)]));

describe("readSkillUpload", () => {
  test("turns a single Markdown file into SKILL.md", async () => {
    const files = await readSkillUpload(new File(["# Review"], "review.md"));
    expect(decoded(files)).toEqual({ "SKILL.md": "# Review" });
  });

  test("strips a single top-level folder and archive noise", async () => {
    const files = await readSkillUpload(
      zipFile({
        "code-review/SKILL.md": strToU8("---\nname: code-review\n---"),
        "code-review/scripts/run.sh": strToU8("echo hi"),
        "code-review/.DS_Store": strToU8("x"),
        "__MACOSX/code-review/._SKILL.md": strToU8("x")
      })
    );
    expect(sortSkillFiles(files).map((file) => file.path)).toEqual(["SKILL.md", "scripts/run.sh"]);
  });

  test("skips hidden files and folders", async () => {
    const files = await readSkillUpload(
      zipFile({
        "code-review/SKILL.md": strToU8("a"),
        "code-review/.env": strToU8("x"),
        "code-review/.git/config": strToU8("x"),
        "code-review/docs/.notes/a.md": strToU8("x"),
        "code-review/docs/guide.md": strToU8("b")
      })
    );
    expect(sortSkillFiles(files).map((file) => file.path)).toEqual(["SKILL.md", "docs/guide.md"]);
  });

  test("keeps paths when the files are at the archive root", async () => {
    const files = await readSkillUpload(
      zipFile({ "SKILL.md": strToU8("a"), "docs/guide.md": strToU8("b") })
    );
    expect(sortSkillFiles(files).map((file) => file.path)).toEqual(["SKILL.md", "docs/guide.md"]);
  });

  test("reads Windows-style backslash paths as folders", async () => {
    const files = await readSkillUpload(
      zipFile({
        "review\\SKILL.md": strToU8("a"),
        "review\\scripts\\run.sh": strToU8("b")
      })
    );
    expect(sortSkillFiles(files).map((file) => file.path)).toEqual(["SKILL.md", "scripts/run.sh"]);
  });

  test("reads UTF-8 names from a macOS zip that doesn't flag them as UTF-8", async () => {
    const archive = zipSync({
      "café/SKILL.md": strToU8("a"),
      "café/docs/日本語.md": strToU8("b"),
      "café/Ünïcödé 🎉.txt": strToU8("c")
    });
    // Clears the UTF-8 flag (bit 11) in each local and central header, as macOS's zip and Finder write them.
    const view = new DataView(archive.buffer);
    const clearUtf8Flag = (offset: number) => {
      const flags = view.getUint16(offset, true);
      if (Math.floor(flags / 0x800) % 2 === 1) view.setUint16(offset, flags - 0x800, true);
    };
    for (let i = 0; i + 4 <= archive.length; i += 1) {
      const signature = view.getUint32(i, true);
      if (signature === 0x04034b50) clearUtf8Flag(i + 6);
      if (signature === 0x02014b50) clearUtf8Flag(i + 8);
    }
    const files = await readSkillUpload(new File([archive], "skill.zip"));
    expect(sortSkillFiles(files).map((file) => file.path)).toEqual([
      "SKILL.md",
      "docs/日本語.md",
      "Ünïcödé 🎉.txt"
    ]);
  });

  test("keeps a Latin-1 name that isn't valid UTF-8", async () => {
    const archive = zipSync({ "SKILL.md": strToU8("a"), "caf\u00e9.md": strToU8("b") });
    const files = await readSkillUpload(new File([archive], "skill.zip"));
    expect(sortSkillFiles(files).map((file) => file.path)).toEqual(["SKILL.md", "caf\u00e9.md"]);
  });

  test("refuses an entry over the file limit before inflating it", async () => {
    await expect(
      readSkillUpload(zipFile({ "SKILL.md": new Uint8Array(256 * 1024 + 1) }))
    ).rejects.toThrow("File 'SKILL.md' is larger than 256 KB.");
  });

  test("refuses more than 50 files", async () => {
    const entries = Object.fromEntries(
      Array.from({ length: 51 }, (_, index) => [`f${index}.md`, strToU8("x")])
    );
    await expect(readSkillUpload(zipFile(entries))).rejects.toThrow(
      "A skill can hold at most 50 files."
    );
  });

  test("explains a file that is not a zip", async () => {
    await expect(readSkillUpload(new File(["nope"], "skill.zip"))).rejects.toBeInstanceOf(
      SkillPackageError
    );
    await expect(readSkillUpload(new File(["x"], "skill.txt"))).rejects.toThrow(
      "Upload a .zip of the skill's folder, or a single .md file."
    );
  });
});

describe("formatSkillHeaderValue", () => {
  test("writes a value plain when YAML reads it back as the same string", () => {
    expect(formatSkillHeaderValue("code-review")).toBe("code-review");
    expect(formatSkillHeaderValue("Reviews code. Use when asked.")).toBe(
      "Reviews code. Use when asked."
    );
  });

  test("quotes values YAML would read as something else", () => {
    expect(formatSkillHeaderValue("12")).toBe('"12"');
    expect(formatSkillHeaderValue("1e5")).toBe('"1e5"');
    expect(formatSkillHeaderValue("true")).toBe('"true"');
    expect(formatSkillHeaderValue("null")).toBe('"null"');
    expect(formatSkillHeaderValue("")).toBe('""');
    expect(formatSkillHeaderValue("Use when: reviewing")).toBe('"Use when: reviewing"');
    expect(formatSkillHeaderValue("a # not a comment")).toBe('"a # not a comment"');
    expect(formatSkillHeaderValue("'quoted'")).toBe("\"'quoted'\"");
    expect(formatSkillHeaderValue(" padded ")).toBe('" padded "');
  });

  test("quotes words YAML 1.1 reads as booleans or null", () => {
    ["yes", "no", "on", "off", "y", "N", "True", "NULL", "~"].forEach((value) =>
      expect(formatSkillHeaderValue(value)).toBe(`"${value}"`)
    );
    expect(formatSkillHeaderValue("yesterday")).toBe("yesterday");
  });
});

describe("setSkillHeaderValue", () => {
  test("rewrites only the key's value and keeps every other header key and the body", () => {
    const text = "---\nname: old\nlicense: MIT\ndescription: Old.\n---\n\n# Steps\n";
    expect(setSkillHeaderValue(text, "name", "new-name")).toBe(
      "---\nname: new-name\nlicense: MIT\ndescription: Old.\n---\n\n# Steps\n"
    );
  });

  test("replaces a value written over several lines", () => {
    const text = "---\ndescription: >\n  First line\n\n  second line\nname: a\n---\nBody\n";
    expect(setSkillHeaderValue(text, "description", "New.")).toBe(
      "---\ndescription: New.\nname: a\n---\nBody\n"
    );
  });

  test("adds a missing key, and a header when there is none", () => {
    expect(setSkillHeaderValue("---\nname: a\n---\nBody", "description", "true")).toBe(
      '---\nname: a\ndescription: "true"\n---\nBody'
    );
    expect(setSkillHeaderValue("---\n---\nBody", "name", "a")).toBe("---\nname: a\n---\nBody");
    expect(setSkillHeaderValue("Body", "name", "a")).toBe("---\nname: a\n---\n\nBody");
  });

  test("rewrites a quoted key instead of adding a second one", () => {
    expect(setSkillHeaderValue('---\n"name": a\n---\nBody', "name", "b")).toBe(
      "---\nname: b\n---\nBody"
    );
    expect(setSkillHeaderValue("---\n'name' : a\n---\nBody", "name", "b")).toBe(
      "---\nname: b\n---\nBody"
    );
  });

  test("keeps a double-quoted value quoted", () => {
    expect(setSkillHeaderValue("---\ndescription: Hi\n---\n", "description", "Hi ")).toBe(
      '---\ndescription: "Hi "\n---\n'
    );
    expect(setSkillHeaderValue('---\ndescription: "Hi "\n---\n', "description", "Hi t")).toBe(
      '---\ndescription: "Hi t"\n---\n'
    );
  });

  test("keeps Windows line endings", () => {
    expect(setSkillHeaderValue("---\r\nname: a\r\nx: 1\r\n---\r\nBody", "name", "b")).toBe(
      "---\r\nname: b\r\nx: 1\r\n---\r\nBody"
    );
  });

  test("reads back as the value it was given", () => {
    ["12", 'Says "hi" # twice', "a: b", "line\nbreak"].forEach((value) => {
      const { frontmatter } = splitFrontmatter(setSkillHeaderValue("", "description", value));
      expect(parseSkillHeader(frontmatter ?? "")?.description).toBe(value);
    });
  });
});

describe("isReservedSkillName", () => {
  test("refuses Windows device names", () => {
    ["con", "prn", "aux", "nul", "com1", "com9", "lpt1", "lpt9"].forEach((name) =>
      expect(isReservedSkillName(name)).toBe(true)
    );
    ["console", "com0", "aux-tools", "code-review"].forEach((name) =>
      expect(isReservedSkillName(name)).toBe(false)
    );
    expect(getReservedSkillNameMessage("aux")).toBe(
      "'aux' is a reserved name and can't be used as a skill name."
    );
  });
});

describe("fromDraftFiles", () => {
  test("keeps the original bytes of a file whose text is unchanged", () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("# Hi\n")]);
    const [draft] = toDraftFiles([
      { path: "SKILL.md", mode: "0644", contentBase64: bytesToBase64(withBom) }
    ]);
    expect(draft.text).toBe("# Hi\n");
    expect(fromDraftFiles([draft])[0].contentBase64).toBe(bytesToBase64(withBom));
  });

  test("re-encodes a file whose text changed, and keeps its mode", () => {
    const [draft] = toDraftFiles([
      { path: "run.sh", mode: "0755", contentBase64: bytesToBase64(strToU8("echo a\n")) }
    ]);
    expect(fromDraftFiles([{ ...draft, text: "echo b\n" }])).toEqual([
      { path: "run.sh", mode: "0755", contentBase64: bytesToBase64(strToU8("echo b\n")) }
    ]);
  });
});

describe("normalizeSkillPath", () => {
  test("uses forward slashes and drops leading ./ and /", () => {
    expect(normalizeSkillPath(" ./scripts\\check.sh ")).toBe("scripts/check.sh");
    expect(normalizeSkillPath("/docs//guide.md")).toBe("docs/guide.md");
  });
});

describe("getSkillPathError", () => {
  test("accepts ordinary relative paths", () => {
    expect(getSkillPathError("SKILL.md")).toBeNull();
    expect(getSkillPathError("scripts/check.sh")).toBeNull();
    expect(getSkillPathError("docs/.env.example")).toBeNull();
    expect(getSkillPathError("CONSOLE.md")).toBeNull();
  });

  test("refuses what the server refuses", () => {
    expect(getSkillPathError("")).toBe("Enter a name.");
    expect(getSkillPathError("a\\b")).toBe("A name can't contain a backslash.");
    expect(getSkillPathError("a\u0001b")).toBe("A name can't contain control characters.");
    expect(getSkillPathError("a\uD800")).toBe("A name must be valid Unicode text.");
    expect(getSkillPathError("/abs")).toBe("A name can't be empty, '.' or '..'.");
    expect(getSkillPathError("a//b")).toBe("A name can't be empty, '.' or '..'.");
    expect(getSkillPathError("../x")).toBe("A name can't be empty, '.' or '..'.");
    ["a:b", "a<b", "a>b", 'a"b', "a|b", "a?b", "a*b"].forEach((path) =>
      expect(getSkillPathError(path)).toMatch(/can't contain any of/)
    );
    expect(getSkillPathError("docs./a.md")).toBe("'docs.' can't end in a dot or a space.");
    expect(getSkillPathError("a /b")).toMatch(/can't end in a dot or a space/);
  });

  test("limits each file or folder name to 255 UTF-8 bytes", () => {
    expect(getSkillPathError("é".repeat(127))).toBeNull();
    const long = "é".repeat(128);
    expect(getSkillPathError(`docs/${long}`)).toBe(
      `File name '${long.slice(0, 64)}…' in 'docs/${long}' is too long. Shorten it.`
    );
  });

  test("refuses Windows device names with or without an extension", () => {
    ["CON", "prn", "Aux.txt", "nul.tar.gz", "COM1", "lpt9.md", "scripts/com3"].forEach((path) =>
      expect(getSkillPathError(path)).toMatch(/is a reserved name/)
    );
    expect(getSkillPathError("COM0")).toBeNull();
    expect(getSkillPathError("LPT10")).toBeNull();
  });

  test("refuses paths longer than 255 characters", () => {
    expect(getSkillPathError("a".repeat(255))).toBeNull();
    expect(getSkillPathError("a".repeat(256))).toMatch(/at most 255 characters/);
  });
});

describe("getSkillEntryNameError", () => {
  const filePaths = ["SKILL.md", "docs/guide.md", "scripts/run.sh"];
  const folderPaths = getSkillFolders(filePaths, ["empty"]);
  const check = (name: string, parentPath = "", renamingPath?: string) =>
    getSkillEntryNameError({ name, parentPath, filePaths, folderPaths, renamingPath });

  test("accepts a new name in the root or a folder", () => {
    expect(check("README.md")).toBeNull();
    expect(check("other.md", "docs")).toBeNull();
    expect(check("nested", "empty")).toBeNull();
  });

  test("refuses slashes, since folders are made one at a time", () => {
    expect(check("a/b.md")).toMatch(/can't contain '\/'/);
  });

  test("refuses a name already used, ignoring case and Unicode form", () => {
    expect(check("skill.md")).toBe(
      "A file named 'SKILL.md' is already here. Names must be unique ignoring case."
    );
    expect(check("guide.md", "docs")).toBe("A file named 'guide.md' is already here.");
    expect(
      getSkillEntryNameError({
        name: "café.md",
        parentPath: "",
        filePaths: ["café.md"],
        folderPaths: []
      })
    ).toMatch(/already here/);
  });

  test("refuses a file where a folder is, and a folder where a file is", () => {
    expect(check("Docs")).toBe(
      "A folder named 'docs' is already here. Names must be unique ignoring case."
    );
    expect(check("empty")).toBe("A folder named 'empty' is already here.");
    expect(check("run.sh", "scripts")).toBe("A file named 'run.sh' is already here.");
  });

  test("lets a rename change only the case of its own name", () => {
    expect(check("Guide.md", "docs", "docs/guide.md")).toBeNull();
    expect(check("Scripts", "", "scripts")).toBeNull();
    expect(check("docs", "", "scripts")).toMatch(/already here/);
  });

  test("checks the longest path a renamed folder would give its files", () => {
    expect(check("x".repeat(250), "", "scripts")).toMatch(/longer than 255/);
  });

  test("checks the joined path against the server rules", () => {
    expect(check("nul.md", "docs")).toMatch(/is a reserved name/);
    expect(check("trailing.", "docs")).toMatch(/can't end in a dot/);
  });
});

describe("file tree edits", () => {
  const files = [
    { path: "SKILL.md" },
    { path: "docs/a.md" },
    { path: "docs/deep/b.md" },
    { path: "docsx.md" }
  ];

  test("renames a folder with everything in it, and nothing that only shares a prefix", () => {
    expect(renameSkillPaths(files, "docs", "guides").map((file) => file.path)).toEqual([
      "SKILL.md",
      "guides/a.md",
      "guides/deep/b.md",
      "docsx.md"
    ]);
    expect(renameSkillFolders(["docs", "docs/deep", "docsx"], "docs", "g")).toEqual([
      "g",
      "g/deep",
      "docsx"
    ]);
  });

  test("renames a single file", () => {
    expect(renameSkillPaths(files, "docs/a.md", "docs/c.md").map((file) => file.path)).toContain(
      "docs/c.md"
    );
  });

  test("removes a folder with everything in it", () => {
    expect(removeSkillPath(files, "docs").map((file) => file.path)).toEqual([
      "SKILL.md",
      "docsx.md"
    ]);
    expect(removeSkillPath(["docs", "docs/deep", "docsx"], "docs")).toEqual(["docsx"]);
  });

  test("lists every folder that holds a file, plus empty ones", () => {
    expect(getSkillFolders(["a/b/c.md", "d.md"], ["e"]).sort()).toEqual(["a", "a/b", "e"]);
  });

  test("splits and joins paths", () => {
    expect(joinSkillPath("", "a.md")).toBe("a.md");
    expect(joinSkillPath("docs", "a.md")).toBe("docs/a.md");
    expect(getSkillParentPath("docs/deep/b.md")).toBe("docs/deep");
    expect(getSkillParentPath("SKILL.md")).toBe("");
    expect(getSkillBaseName("docs/deep/b.md")).toBe("b.md");
  });
});

describe("parseSkillHeader", () => {
  test("reads the header as the server does", () => {
    expect(parseSkillHeader("name: code-review\ndescription: Reviews code.")).toEqual({
      name: "code-review",
      description: "Reviews code."
    });
    expect(parseSkillHeader("name: 'a'\ndescription: 'It''s fine.'\nlicense: MIT")).toEqual({
      name: "a",
      description: "It's fine.",
      license: "MIT"
    });
    expect(parseSkillHeader("name: 12\ndescription: >\n  First line\n  second line\n")).toEqual({
      name: 12,
      description: "First line second line\n"
    });
    expect(parseSkillHeader("")).toEqual({});
  });

  test("returns null when the header can't be read", () => {
    expect(parseSkillHeader("name: [unclosed")).toBeNull();
    expect(parseSkillHeader("- a\n- b")).toBeNull();
    expect(parseSkillHeader("just text")).toBeNull();
  });
});

describe("getSkillHeaderError", () => {
  test("names the line and key of an unquoted value with ': ', as in real skills", () => {
    expect(
      getSkillHeaderError(
        "name: audit\ndescription: Audit a large multi-repo change set for coherence: reverse-engineer what it was built to do\ndisable-model-invocation: true\nargument-hint: [repo paths and/or head ref]"
      )
    ).toBe(
      "Line 3 of SKILL.md: the 'description' value contains ': '. Put the value in double quotes."
    );
    expect(
      getSkillHeaderError(
        "name: infi\ndescription: Drive a local Infisical dev stack: print an org-scoped user JWT\nargument-hint: login | relay <name>"
      )
    ).toBe(
      "Line 3 of SKILL.md: the 'description' value contains ': '. Put the value in double quotes."
    );
    expect(
      getSkillHeaderError(
        "name: scrutinize\r\ndescription: Saif's full PR review. Verifies: every claim\r\ndisable-model-invocation: true"
      )
    ).toBe(
      "Line 3 of SKILL.md: the 'description' value contains ': '. Put the value in double quotes."
    );
  });

  test("gives the parser's reason and the line for other broken YAML", () => {
    expect(getSkillHeaderError("name: a\ndescription: d\n  bad: indent")).toBe(
      "Line 4 of SKILL.md: the header is not valid YAML (bad indentation of a mapping entry)."
    );
    expect(getSkillHeaderError("name: a\r\ndescription: d\r\n  bad: indent")).toBe(
      "Line 4 of SKILL.md: the header is not valid YAML (bad indentation of a mapping entry)."
    );
  });

  test.each([
    ["---\nname: a\ndescription: d\nx: 1\nhint: [x\n---\n", "opens a '[' that never closes"],
    ["---\nname: a\ndescription: d\nx: 1\nhint: {x\n---\n", "opens a '{' that never closes"],
    [
      '---\nname: a\ndescription: d\nx: 1\nhint: "x\n---\n',
      "opens a double quote that never closes"
    ],
    [
      "---\nname: a\ndescription: d\nx: 1\nhint: 'x\n---\n",
      "opens a single quote that never closes"
    ],
    ["---\nname: a\nlist: [a,\n  b]\nhint: {x\n---\n", "opens a '{' that never closes"],
    [
      "---\r\nname: a\r\ndescription: d\r\nx: 1\r\nhint: [x\r\n---\r\n",
      "opens a '[' that never closes"
    ],
    ["\uFEFF---\nname: a\ndescription: d\nx: 1\nhint: [x\n---\n", "opens a '[' that never closes"]
  ])("names the line of a value that never closes in %j", (text, problem) => {
    const { frontmatter } = splitFrontmatter(new TextDecoder().decode(strToU8(text)));
    expect(getSkillHeaderError(frontmatter ?? "")).toBe(
      `Line 5 of SKILL.md: the 'hint' value ${problem}.`
    );
  });

  test.each([
    '---\ndescription: "first\nsecond"\nname: a\nname: b\n---\n',
    "---\nhint: [a,\n# note\n  b]\nname: a\nname: b\n---\n"
  ])("does not blame a value that continues at column zero in %j", (text) => {
    const { frontmatter } = splitFrontmatter(text);
    expect(getSkillHeaderError(frontmatter ?? "")).toMatch(/duplicated mapping key/);
  });

  test("still names a quote left open before the next key", () => {
    const { frontmatter } = splitFrontmatter('---\nname: "oops\ndescription: y\n---\n');
    expect(getSkillHeaderError(frontmatter ?? "")).toBe(
      "Line 2 of SKILL.md: the 'name' value opens a double quote that never closes."
    );
  });

  test("returns null for a header that parses, quoted colons included", () => {
    expect(getSkillHeaderError('name: a\ndescription: "Review: then fix"')).toBeNull();
    expect(getSkillHeaderError("name: a\ndescription: >\n  Review: then fix")).toBeNull();
    expect(getSkillHeaderError("")).toBeNull();
  });

  test("keeps the generic message for a header that isn't a list of key: value lines", () => {
    expect(getSkillHeaderError("- a\n- b")).toBe("The header in SKILL.md is not valid YAML.");
  });
});

describe("getSkillHeaderText", () => {
  test("shows scalars as text and anything else as empty", () => {
    expect(getSkillHeaderText("a")).toBe("a");
    expect(getSkillHeaderText(12)).toBe("12");
    expect(getSkillHeaderText(null)).toBe("");
    expect(getSkillHeaderText(undefined)).toBe("");
  });
});

describe("countLineChanges", () => {
  test("counts added and removed lines", () => {
    expect(countLineChanges("a\nb\nc\n", "a\nB\nc\nd\n")).toEqual({
      additions: 2,
      deletions: 1
    });
    expect(countLineChanges("", "one\ntwo")).toEqual({ additions: 2, deletions: 0 });
    expect(countLineChanges("same\n", "same\n")).toEqual({ additions: 0, deletions: 0 });
  });
});

describe("getSkillFileChanges", () => {
  const original = toDraftFiles([
    toSkillFile("SKILL.md", "# Skill\n"),
    { ...toSkillFile("run.sh", "echo hi\n"), mode: "0755" },
    toSkillFile("old.md", "gone\nsoon\n")
  ]);

  test("reports nothing for an untouched draft", () => {
    expect(getSkillFileChanges(original, original)).toEqual([]);
  });

  test("reports added, modified, mode-only and deleted files with line counts", () => {
    const draft = [
      { ...original[0], text: "# Skill\nMore\n" },
      original.find((file) => file.path === "run.sh")!,
      newDraftFile("notes/new.md", "a\nb\n")
    ].map((file) => (file.path === "run.sh" ? { ...file, mode: "0644" as const } : file));

    expect(
      getSkillFileChanges(original, draft).map(
        ({ path, status, additions, deletions, newMode }) => ({
          path,
          status,
          additions,
          deletions,
          newMode
        })
      )
    ).toEqual([
      { path: "SKILL.md", status: "modified", additions: 1, deletions: 0, newMode: undefined },
      { path: "run.sh", status: "modified", additions: 0, deletions: 0, newMode: "0644" },
      { path: "notes/new.md", status: "added", additions: 2, deletions: 0, newMode: "0644" },
      { path: "old.md", status: "deleted", additions: 0, deletions: 2, newMode: undefined }
    ]);
  });
});

describe("buildDiffRows", () => {
  test("numbers lines and folds long unchanged runs", () => {
    const before = `${Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n")}\n`;
    const after = before.replace("line 9\n", "line nine\n");
    const rows = buildDiffRows(before, after, 2);
    expect(rows[0]).toEqual({ type: "skip", count: 6 });
    expect(rows.slice(1)).toEqual([
      { type: "context", text: "line 7", oldLine: 7, newLine: 7 },
      { type: "context", text: "line 8", oldLine: 8, newLine: 8 },
      { type: "removed", text: "line 9", oldLine: 9, newLine: null },
      { type: "added", text: "line nine", oldLine: null, newLine: 9 },
      { type: "context", text: "line 10", oldLine: 10, newLine: 10 }
    ]);
  });

  test("marks the side without a final newline when only that changed", () => {
    expect(buildDiffRows("a\nb", "a\nb\n")).toEqual([
      { type: "context", text: "a", oldLine: 1, newLine: 1 },
      { type: "removed", text: "b", oldLine: 2, newLine: null },
      { type: "context", text: "\\ No newline at end of file", oldLine: null, newLine: null },
      { type: "added", text: "b", oldLine: null, newLine: 2 }
    ]);
    expect(
      buildDiffRows("a\nb", "a\nc").some((row) => row.type === "context" && row.oldLine === null)
    ).toBe(false);
  });
});

describe("modes and SKILL.md uploads", () => {
  const previous = [
    toSkillFile("SKILL.md", "old"),
    { ...toSkillFile("scripts/run.sh", "echo"), mode: "0755" as const },
    toSkillFile("docs/a.md", "a")
  ];

  test("an uploaded archive keeps each existing path's mode", () => {
    const uploaded = [toSkillFile("SKILL.md", "new"), toSkillFile("scripts/run.sh", "echo 2")];
    expect(carrySkillFileModes(uploaded, previous).map((file) => file.mode)).toEqual([
      "0644",
      "0755"
    ]);
  });

  test("a single SKILL.md replaces only SKILL.md", () => {
    const files = replaceSkillEntryFile(previous, toSkillFile("SKILL.md", "new"));
    expect(Object.fromEntries(files.map((file) => [file.path, decodeSkillFile(file)]))).toEqual({
      "SKILL.md": "new",
      "scripts/run.sh": "echo",
      "docs/a.md": "a"
    });
    expect(files.find((file) => file.path === "scripts/run.sh")?.mode).toBe("0755");
  });

  test("a downloaded zip holds the files under the skill's folder", () => {
    const entries = unzipSync(buildSkillZip("review", previous));
    expect(Object.keys(entries).sort()).toEqual([
      "review/SKILL.md",
      "review/docs/a.md",
      "review/scripts/run.sh"
    ]);
  });

  test("a downloaded zip keeps each file's mode", () => {
    const zip = buildSkillZip("review", previous);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const modes: Record<string, number> = {};
    for (let offset = 0; offset + 46 <= zip.length; offset += 1) {
      if (view.getUint32(offset, true) === 0x02014b50) {
        const nameLength = view.getUint16(offset + 28, true);
        const name = new TextDecoder().decode(zip.subarray(offset + 46, offset + 46 + nameLength));
        // eslint-disable-next-line no-bitwise
        modes[name] = (view.getUint32(offset + 38, true) >>> 16) & 0o777;
      }
    }
    expect(modes).toEqual({
      "review/SKILL.md": 0o644,
      "review/scripts/run.sh": 0o755,
      "review/docs/a.md": 0o644
    });
  });
});

describe("splitFrontmatter", () => {
  test("separates a leading YAML header from the body", () => {
    expect(splitFrontmatter("---\nname: a\n---\n\n# Body\n")).toEqual({
      frontmatter: "name: a",
      body: "\n# Body\n"
    });
    expect(splitFrontmatter("# No header")).toEqual({ frontmatter: null, body: "# No header" });
    expect(splitFrontmatter("---\n---\nBody\n---\n")).toEqual({
      frontmatter: "",
      body: "Body\n---\n"
    });
  });

  test("accepts trailing spaces after the opening marker", () => {
    expect(splitFrontmatter("--- \nname: a\n---\nBody")).toEqual({
      frontmatter: "name: a",
      body: "Body"
    });
    expect(splitFrontmatter("---\t\r\nname: a\r\n---\r\nBody")).toEqual({
      frontmatter: "name: a",
      body: "Body"
    });
    expect(setSkillHeaderValue("--- \nname: a\n---\nBody", "name", "b")).toBe(
      "--- \nname: b\n---\nBody"
    );
  });
});

describe("executable files in an uploaded zip", () => {
  test("keeps 0755 for an entry whose Unix mode has an execute bit", async () => {
    const archive = buildSkillZip("review", [
      toSkillFile("SKILL.md", "# Review"),
      { ...toSkillFile("scripts/check.sh", "echo ok"), mode: "0755" }
    ]);
    const files = await readSkillUpload(new File([archive], "review.zip"));
    expect(Object.fromEntries(files.map((file) => [file.path, file.mode]))).toEqual({
      "SKILL.md": "0644",
      "scripts/check.sh": "0755"
    });
  });

  // Browsers decode the "latin1" label as Windows-1252, so 日本語's bytes 0x80-0x9f once named a different file
  // than fflate did. Node decodes it as true Latin-1, so this guards the decoder choice rather than reproducing it.
  test("keeps 0755 for a non-Latin name in a zip that doesn't flag names as UTF-8", async () => {
    const archive = buildSkillZip("review", [
      toSkillFile("SKILL.md", "# Review"),
      { ...toSkillFile("scripts/日本語.sh", "echo ok"), mode: "0755" }
    ]);
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    const clearUtf8Flag = (offset: number) => {
      const flags = view.getUint16(offset, true);
      if (Math.floor(flags / 0x800) % 2 === 1) view.setUint16(offset, flags - 0x800, true);
    };
    for (let i = 0; i + 4 <= archive.length; i += 1) {
      const signature = view.getUint32(i, true);
      if (signature === 0x04034b50) clearUtf8Flag(i + 6);
      if (signature === 0x02014b50) clearUtf8Flag(i + 8);
    }
    const files = await readSkillUpload(new File([archive], "review.zip"));
    expect(Object.fromEntries(files.map((file) => [file.path, file.mode]))).toEqual({
      "SKILL.md": "0644",
      "scripts/日本語.sh": "0755"
    });
  });

  test("reads 0644 when the archive carries no Unix modes", async () => {
    const files = await readSkillUpload(
      zipFile({ "SKILL.md": strToU8("# Review"), "scripts/check.sh": strToU8("echo ok") })
    );
    expect(files.map((file) => file.mode)).toEqual(["0644", "0644"]);
  });

  test("an executable entry stays executable when carrying the previous modes", () => {
    const previous = [toSkillFile("scripts/check.sh", "echo")];
    const uploaded = [{ ...toSkillFile("scripts/check.sh", "echo 2"), mode: "0755" as const }];
    expect(carrySkillFileModes(uploaded, previous)[0].mode).toBe("0755");
  });
});

describe("getChangedSkillPaths", () => {
  const base = toDraftFiles([
    toSkillFile("SKILL.md", "a"),
    toSkillFile("scripts/run.sh", "echo"),
    toSkillFile("docs/a.md", "a")
  ]);

  test("finds edited, added and mode-changed files without diffing", () => {
    const draft = [
      { ...base[0], text: "b" },
      { ...base[1] },
      { ...base[2], mode: "0755" as const },
      newDraftFile("new.md", "x")
    ];
    const { changedPaths, hasChanges } = getChangedSkillPaths(base, draft);
    expect([...changedPaths].sort()).toEqual(["SKILL.md", "new.md", "scripts/run.sh"]);
    expect(hasChanges).toBe(true);
  });

  test("counts a deleted file as a change", () => {
    const { changedPaths, hasChanges } = getChangedSkillPaths(base, base.slice(0, 2));
    expect(changedPaths.size).toBe(0);
    expect(hasChanges).toBe(true);
  });

  test("reports nothing for an unchanged draft", () => {
    expect(
      getChangedSkillPaths(
        base,
        base.map((file) => ({ ...file }))
      ).hasChanges
    ).toBe(false);
  });
});

describe("large files in the save review", () => {
  test("a modified file over 2,000 lines is not diffed", () => {
    const big = Array.from({ length: 2001 }, (_, i) => `line ${i}`).join("\n");
    const [change] = getSkillFileChanges(toDraftFiles([toSkillFile("big.txt", big)]), [
      { ...toDraftFiles([toSkillFile("big.txt", big)])[0], text: `${big}\nmore` }
    ]);
    expect(change.isTooLarge).toBe(true);
    expect([change.additions, change.deletions]).toEqual([0, 0]);
  });

  test("a small modified file is diffed", () => {
    const [change] = getSkillFileChanges(toDraftFiles([toSkillFile("a.txt", "a\n")]), [
      { ...toDraftFiles([toSkillFile("a.txt", "a\n")])[0], text: "b\n" }
    ]);
    expect(change.isTooLarge).toBe(false);
    expect([change.additions, change.deletions]).toEqual([1, 1]);
  });
});
