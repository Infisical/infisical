import { describe, expect, test } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import {
  AGENT_VAULT_SKILL_MAX_FILE_BYTES,
  AGENT_VAULT_SKILL_MAX_FILES,
  AGENT_VAULT_SKILL_UPLOAD_BODY_LIMIT,
  parseSkillHeader,
  replaceSkillHeaderName,
  sha256Hex,
  skillSizeBucket,
  validateSkillFiles
} from "./agent-vault-skill-fns";
import { AgentVaultSkillFileMode } from "./agent-vault-skill-types";

const b64 = (text: string | Buffer) => Buffer.from(text).toString("base64");

const manifest = (header: string, body = "Do the thing.\n") => `---\n${header}\n---\n${body}`;

const file = (path: string, content: string | Buffer, mode = AgentVaultSkillFileMode.Regular) => ({
  path,
  mode,
  contentBase64: b64(content)
});

const skillMd = (header = "name: code-review\ndescription: Reviews code") => file("SKILL.md", manifest(header));

const expectBadRequest = (fn: () => unknown, message: string | RegExp) => {
  let thrown: unknown;
  try {
    fn();
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(BadRequestError);
  expect((thrown as Error).message).toMatch(message);
};

describe("validateSkillFiles limits", () => {
  test("accepts a minimal skill", () => {
    const result = validateSkillFiles([skillMd()]);
    expect(result.name).toBe("code-review");
    expect(result.description).toBe("Reviews code");
    expect(result.fileCount).toBe(1);
  });

  test("requires SKILL.md at the root", () => {
    expectBadRequest(
      () => validateSkillFiles([file("docs/SKILL.md", manifest("name: a\ndescription: b"))]),
      "SKILL.md is missing."
    );
    expectBadRequest(
      () => validateSkillFiles([file("skill.md", manifest("name: a\ndescription: b"))]),
      "SKILL.md is missing."
    );
  });

  test("refuses a file over the per-file cap and names it", () => {
    expectBadRequest(
      () => validateSkillFiles([skillMd(), file("scripts/x.sh", Buffer.alloc(AGENT_VAULT_SKILL_MAX_FILE_BYTES + 1))]),
      "File 'scripts/x.sh' is larger than 256 KB."
    );
  });

  test("accepts a file at exactly the per-file cap", () => {
    expect(() =>
      validateSkillFiles([skillMd(), file("big.bin", Buffer.alloc(AGENT_VAULT_SKILL_MAX_FILE_BYTES))])
    ).not.toThrow();
  });

  test("refuses a skill over the total cap", () => {
    const files = [0, 1, 2, 3, 4].map((i) => file(`part-${i}.bin`, Buffer.alloc(AGENT_VAULT_SKILL_MAX_FILE_BYTES)));
    expectBadRequest(() => validateSkillFiles([skillMd(), ...files]), /add up to more than 1 MB/);
  });

  test("refuses more files than the cap", () => {
    const files = Array.from({ length: AGENT_VAULT_SKILL_MAX_FILES }, (_, i) => file(`f${i}.txt`, "x"));
    expectBadRequest(() => validateSkillFiles([skillMd(), ...files]), /at most 50 files/);
  });

  test("a single 1.05 MB file fits the upload body and gets the 400 that names it", () => {
    const big = file("big.bin", Buffer.alloc(Math.round(1.05 * 1024 * 1024)));
    expect(big.contentBase64.length).toBeLessThan(AGENT_VAULT_SKILL_UPLOAD_BODY_LIMIT);
    expectBadRequest(() => validateSkillFiles([skillMd(), big]), "File 'big.bin' is larger than 256 KB.");
  });

  test("refuses content that is not base64", () => {
    expectBadRequest(
      () =>
        validateSkillFiles([skillMd(), { path: "a.txt", mode: AgentVaultSkillFileMode.Regular, contentBase64: "@@@" }]),
      "File 'a.txt' is not valid base64."
    );
  });
});

describe("validateSkillFiles paths", () => {
  test.each(["/etc/passwd", "../escape.sh", "a/../../b", "a//b", "./a", "a/"])("refuses '%s'", (path) => {
    expectBadRequest(
      () => validateSkillFiles([skillMd(), file(path, "x")]),
      `File path '${path}' must be a relative path inside the skill folder`
    );
  });

  test("refuses an empty path", () => {
    expectBadRequest(() => validateSkillFiles([skillMd(), file("", "x")]), "A file has an empty path.");
  });

  test("refuses a backslash and a control character, naming the file", () => {
    expectBadRequest(() => validateSkillFiles([skillMd(), file("a\\b", "x")]), "File path 'a\\b' uses a backslash.");
    expectBadRequest(
      () => validateSkillFiles([skillMd(), file("a\nb", "x")]),
      'File path "a\\nb" contains a control character.'
    );
  });

  test.each(["C:/x", "a:b.md", "a<b", "a>b", 'a"b', "a|b", "a?b", "docs/a*.md"])(
    "refuses a character Windows does not allow in '%s'",
    (path) => {
      expectBadRequest(
        () => validateSkillFiles([skillMd(), file(path, "x")]),
        `File path '${path}' can't contain any of`
      );
    }
  );

  test.each([
    ["notes.", "notes."],
    ["docs./a.md", "docs."],
    ["a /b.md", "a "],
    ["b.md ", "b.md "]
  ])("refuses '%s', which has a part ending in a dot or space", (path, part) => {
    expectBadRequest(
      () => validateSkillFiles([skillMd(), file(path, "x")]),
      `File path '${path}' has a part ending in a dot or a space ('${part}')`
    );
  });

  test.each(["CON", "con.txt", "docs/nul.md", "Aux", "PRN.tar.gz", "com1", "LPT9.log", "COM3/a.md"])(
    "refuses the Windows device name in '%s'",
    (path) => {
      expectBadRequest(
        () => validateSkillFiles([skillMd(), file(path, "x")]),
        new RegExp(`^File path '${path.replace(/\./g, "\\.")}' uses '[^']+', which is a reserved name`)
      );
    }
  );

  test.each(["console.md", "com10", "lpt0.txt", "nullable.md", "docs/con-notes.md"])(
    "accepts '%s', which only looks like a device name",
    (path) => {
      expect(() => validateSkillFiles([skillMd(), file(path, "x")])).not.toThrow();
    }
  );

  test("refuses a lone surrogate", () => {
    expectBadRequest(() => validateSkillFiles([skillMd(), file("a\uD800b.md", "x")]), /is not valid Unicode/);
    expectBadRequest(() => validateSkillFiles([skillMd(), file("a\uDC00.md", "x")]), /is not valid Unicode/);
  });

  test("refuses paths that differ only in case or Unicode form", () => {
    expectBadRequest(
      () => validateSkillFiles([skillMd(), file("Docs/a.md", "x"), file("docs/A.md", "y")]),
      "Files 'Docs/a.md' and 'docs/A.md' would be the same file on disk."
    );
    expectBadRequest(
      () => validateSkillFiles([skillMd(), file("caf\u00e9.md", "x"), file("cafe\u0301.md", "y")]),
      /would be the same file on disk/
    );
    expectBadRequest(
      () => validateSkillFiles([skillMd(), file("CAF\u00c9.md", "x"), file("cafe\u0301.md", "y")]),
      /would be the same file on disk/
    );
    expectBadRequest(
      () => validateSkillFiles([skillMd(), file("a.md", "x"), file("a.md", "y")]),
      "File 'a.md' is listed twice."
    );
  });

  test("refuses a path that is also a folder of another path", () => {
    expectBadRequest(
      () => validateSkillFiles([skillMd(), file("docs", "x"), file("docs/a.md", "y")]),
      "'docs' is a file, but 'docs/a.md' puts it inside a folder of the same name."
    );
    expectBadRequest(
      () => validateSkillFiles([skillMd(), file("a/b/c.md", "y"), file("A/B", "x")]),
      "'A/B' is a file, but 'a/b/c.md' puts it inside a folder of the same name."
    );
    expectBadRequest(
      () => validateSkillFiles([skillMd(), file("SKILL.md/x", "y")]),
      "'SKILL.md' is a file, but 'SKILL.md/x' puts it inside a folder of the same name."
    );
  });

  test("refuses a path over 255 characters and accepts one at 255", () => {
    const atLimit = `${"a".repeat(200)}/${"b".repeat(54)}`;
    expect(atLimit.length).toBe(255);
    expect(() => validateSkillFiles([skillMd(), file(atLimit, "x")])).not.toThrow();
    expectBadRequest(
      () => validateSkillFiles([skillMd(), file(`${atLimit}c`, "x")]),
      `File path '${"a".repeat(64)}...' is longer than 255 characters.`
    );
  });

  test("refuses a file or folder name over 255 bytes, counting UTF-8 bytes", () => {
    const ascii = "a".repeat(255);
    expect(() => validateSkillFiles([skillMd(), file(ascii, "x")])).not.toThrow();

    // 128 two-byte characters: 128 characters but 256 bytes.
    const wide = "\u00e9".repeat(128);
    expectBadRequest(
      () => validateSkillFiles([skillMd(), file(`docs/${wide}.md`, "x")]),
      `File name '${"\u00e9".repeat(64)}…' in 'docs/${wide}.md' is too long. Shorten it.`
    );
    expectBadRequest(
      () => validateSkillFiles([skillMd(), file(`${wide}/a.md`, "x")]),
      /^File name '[^']+…' in '[^']+' is too long\. Shorten it\.$/
    );
    expect(() => validateSkillFiles([skillMd(), file(`${"\u00e9".repeat(127)}a`, "x")])).not.toThrow();

    // 64 four-byte characters are 256 bytes, so the whole name is shown with no ellipsis.
    const emoji = "\u{1F600}".repeat(64);
    expectBadRequest(
      () => validateSkillFiles([skillMd(), file(emoji, "x")]),
      `File name '${emoji}' in '${emoji}' is too long. Shorten it.`
    );
  });

  test("accepts nested relative paths", () => {
    expect(
      validateSkillFiles([skillMd(), file("scripts/run.sh", "x", AgentVaultSkillFileMode.Executable)]).fileCount
    ).toBe(2);
  });
});

describe("parseSkillHeader", () => {
  const parse = (text: string) => parseSkillHeader(Buffer.from(text));

  test("reads multi-line and quoted values", () => {
    expect(parse(manifest("name: code-review\ndescription: >-\n  Reviews code\n  in two lines")).description).toBe(
      "Reviews code in two lines"
    );
    expect(parse(manifest("name: 'code-review'\ndescription: \"Uses *bold* & more\"")).name).toBe("code-review");
  });

  test("lets plain prose with asterisks through", () => {
    expect(parse(manifest("name: a\ndescription: Use *bold* text")).description).toBe("Use *bold* text");
  });

  test("accepts CRLF line endings and a byte order mark", () => {
    expect(parse(`\uFEFF---\r\nname: a\r\ndescription: b\r\n---\r\nbody`).name).toBe("a");
  });

  test("resolves an alias under the JSON schema", () => {
    expect(parse(manifest("base: &x a\nname: *x\ndescription: b")).name).toBe("a");
  });

  test("reads a block scalar that starts with an asterisk", () => {
    expect(parse(manifest("name: a\ndescription: |\n  *Important*: reviews code")).description).toBe(
      "*Important*: reviews code"
    );
  });

  test("measures the description after trimming it", () => {
    const atLimit = "d".repeat(1024);
    expect(parse(manifest(`name: a\ndescription: |\n  ${atLimit}`)).description).toBe(atLimit);
    expectBadRequest(() => parse(manifest(`name: a\ndescription: |\n  ${"d".repeat(1025)}`)), /longer than 1024/);
  });

  test("refuses a header that is not valid YAML", () => {
    expectBadRequest(() => parse(manifest("name: a\ndescription: [unclosed")), "SKILL.md header is not valid YAML.");
    expectBadRequest(() => parse(manifest("name: a\nname: b\ndescription: c")), "SKILL.md header is not valid YAML.");
    expectBadRequest(
      () => parse(manifest("name: !!js/function 'x'\ndescription: b")),
      "SKILL.md header is not valid YAML."
    );
  });

  test("refuses a missing header", () => {
    expectBadRequest(() => parse("# Just markdown"), /must start with a YAML header/);
    expectBadRequest(() => parse("---\nname: a\ndescription: b\n"), /must start with a YAML header/);
  });

  test("refuses an oversize header", () => {
    expectBadRequest(() => parse(manifest(`name: a\ndescription: b\npad: ${"x".repeat(5000)}`)), /larger than 4 KB/);
  });

  test("checks name and description", () => {
    expectBadRequest(() => parse(manifest("description: b")), "SKILL.md header needs a 'name'.");
    expectBadRequest(
      () => parse(manifest("name: 12\ndescription: b")),
      "The 'name' in SKILL.md must be text. Put it in quotes."
    );
    expectBadRequest(
      () => parse(manifest("name: true\ndescription: b")),
      "The 'name' in SKILL.md must be text. Put it in quotes."
    );
    expect(parse(manifest("name: '12'\ndescription: b")).name).toBe("12");
    expectBadRequest(
      () => parse(manifest("name: a\ndescription: 42")),
      "The 'description' in SKILL.md must be text. Put it in quotes."
    );
    expectBadRequest(
      () => parse(manifest("name: Code Review\ndescription: b")),
      "A skill name can only use lowercase letters, numbers and single hyphens, and can't start or end with a hyphen."
    );
    expectBadRequest(() => parse(manifest("name: code--review\ndescription: b")), /single hyphens/);
    expectBadRequest(() => parse(manifest("name: -code\ndescription: b")), /can't start or end with a hyphen/);
    expectBadRequest(() => parse(manifest(`name: ${"a".repeat(65)}\ndescription: b`)), /longer than 64/);
    expectBadRequest(() => parse(manifest("name: a")), "SKILL.md header needs a 'description'.");
    expectBadRequest(() => parse(manifest(`name: a\ndescription: ${"d".repeat(1025)}`)), /longer than 1024/);
    expectBadRequest(() => parse(manifest("- a\n- b")), /key: value/);
  });
});

describe("replaceSkillHeaderName", () => {
  const rename = (text: string, name = "new-name") => {
    const result = replaceSkillHeaderName(Buffer.from(text), name);
    return result === null ? null : result.toString("utf8");
  };

  test("rewrites a plain value and nothing else", () => {
    const before = manifest("name: old-name\ndescription: Reviews code", "# old-name\n\nname: old-name\n");
    const after = rename(before);
    expect(after).toBe(manifest("name: new-name\ndescription: Reviews code", "# old-name\n\nname: old-name\n"));
    expect(parseSkillHeader(Buffer.from(after!)).name).toBe("new-name");
  });

  test("keeps the quoting style", () => {
    expect(rename(manifest("name: 'old-name'\ndescription: b"))).toBe(manifest("name: 'new-name'\ndescription: b"));
    expect(rename(manifest('name:   "old-name"  \ndescription: b'))).toBe(
      manifest('name:   "new-name"  \ndescription: b')
    );
  });

  test("keeps a trailing comment and comment lines", () => {
    const before = manifest("# the skill\nname: old-name   # set by the CLI\ndescription: b");
    expect(rename(before)).toBe(manifest("# the skill\nname: new-name   # set by the CLI\ndescription: b"));
    expect(rename(manifest("name: 'old-name' # quoted\ndescription: b"))).toBe(
      manifest("name: 'new-name' # quoted\ndescription: b")
    );
  });

  test("keeps CRLF line endings", () => {
    const before = "---\r\nname: old-name\r\ndescription: b\r\n---\r\nbody\r\n";
    expect(rename(before)).toBe("---\r\nname: new-name\r\ndescription: b\r\n---\r\nbody\r\n");
  });

  test("keeps a byte order mark", () => {
    const result = replaceSkillHeaderName(Buffer.from("\uFEFF---\nname: old-name\ndescription: b\n---\n"), "x");
    expect(result!.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(result!.toString("utf8")).toBe("\uFEFF---\nname: x\ndescription: b\n---\n");
    expect(parseSkillHeader(result!).name).toBe("x");
  });

  test("ignores an indented name and anything after the header", () => {
    const before = manifest("meta:\n  name: inner\nname: old-name\ndescription: b", "name: in-body\n");
    expect(rename(before)).toBe(manifest("meta:\n  name: inner\nname: new-name\ndescription: b", "name: in-body\n"));
  });

  test("returns null when there is no name line it can rewrite", () => {
    expect(rename(manifest("description: b"))).toBeNull();
    expect(rename(manifest("name: >-\n  old-name\ndescription: b"))).toBeNull();
    expect(rename(manifest("base: &x old-name\nname: *x\ndescription: b"))).toBeNull();
    expect(rename(manifest("description: b", "name: old-name\n"))).toBeNull();
    expect(rename("# no header\nname: old-name\n")).toBeNull();
  });
});

describe("hashing", () => {
  test("the version hash is over the files sorted by path with content re-encoded", () => {
    const a = validateSkillFiles([file("b.txt", "two"), skillMd(), file("a.txt", "one")]);
    const b = validateSkillFiles([file("a.txt", "one"), skillMd(), file("b.txt", "two")]);
    expect(a.sha256).toBe(b.sha256);
    expect(a.files.map((f) => f.path)).toEqual(["SKILL.md", "a.txt", "b.txt"]);
    expect(a.sha256).toBe(sha256Hex(JSON.stringify(a.files)));
    expect(Object.keys(a.files[0])).toEqual(["path", "mode", "contentBase64"]);

    const changedMode = validateSkillFiles([
      file("a.txt", "one", AgentVaultSkillFileMode.Executable),
      skillMd(),
      file("b.txt", "two")
    ]);
    expect(changedMode.sha256).not.toBe(a.sha256);
  });

  test("sorts paths by UTF-8 bytes, as Go does, so the hash matches", () => {
    // U+FF21 sorts before U+1F600 in UTF-16 code units but after it in UTF-8 bytes.
    const result = validateSkillFiles([
      skillMd(),
      file("\uFF21.md", "x"),
      file("\u{1F600}.md", "y"),
      file("b.md", "z")
    ]);
    expect(result.files.map((f) => f.path)).toEqual(["SKILL.md", "b.md", "\uFF21.md", "\u{1F600}.md"]);
    expect(result.sha256).toBe(sha256Hex(JSON.stringify(result.files)));
  });

  test("size buckets", () => {
    expect(skillSizeBucket(0)).toBe("lt-10kb");
    expect(skillSizeBucket(50 * 1024)).toBe("10kb-100kb");
    expect(skillSizeBucket(1024 * 1024)).toBe("100kb-1mb");
  });
});

describe("validateSkillFiles name line", () => {
  test.each([
    "name: code-review\ndescription: Reviews code",
    'name: "code-review"\ndescription: Reviews code',
    "name: 'code-review' # main\ndescription: Reviews code"
  ])("accepts a name on its own line: %s", (header) => {
    expect(validateSkillFiles([skillMd(header)]).name).toBe("code-review");
  });

  test.each([
    "name: >-\n  code-review\ndescription: Reviews code",
    "{name: code-review, description: Reviews code}",
    "name: &n code-review\ndescription: Reviews code"
  ])("refuses a name a restore could not rewrite: %s", (header) => {
    expectBadRequest(
      () => validateSkillFiles([skillMd(header)]),
      "Write the name on a single line in SKILL.md, like 'name: code-review'."
    );
  });
});
