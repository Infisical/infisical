import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDotEnv, parsePastedSecrets, parseYaml } from "./parseSecrets";

describe("parseYaml", () => {
  it("keeps line breaks in literal block scalars", () => {
    const env = parseYaml(
      [
        "FOO: |",
        "  first line",
        "  second",
        "  and so on",
        "BAR: |",
        "  one",
        "  more",
        "  time"
      ].join("\n")
    );

    assert.deepEqual(Object.keys(env), ["FOO", "BAR"]);
    assert.equal(env.FOO.value, "first line\nsecond\nand so on\n");
    assert.equal(env.BAR.value, "one\nmore\ntime\n");
  });

  it("applies block scalar chomping", () => {
    const clipped = parseYaml(["A: |", "  one", "  two", ""].join("\n"));
    const stripped = parseYaml(["A: |-", "  one", "  two", ""].join("\n"));
    const kept = parseYaml(["A: |+", "  one", "", "", "B: x"].join("\n"));

    assert.equal(clipped.A.value, "one\ntwo\n");
    assert.equal(stripped.A.value, "one\ntwo");
    assert.equal(kept.A.value, "one\n\n\n");
    assert.equal(kept.B.value, "x");
  });

  it("folds folded block scalars", () => {
    const folded = parseYaml(["A: >", "  one", "  two", "", "  three"].join("\n"));
    const foldedStripped = parseYaml(["A: >-", "  one", "  two"].join("\n"));

    assert.equal(folded.A.value, "one two\nthree\n");
    assert.equal(foldedStripped.A.value, "one two");
  });

  it("handles a block scalar whose first body line is blank", () => {
    const env = parseYaml(["A: |", "", "  one", "  two", "B: two"].join("\n"));

    assert.equal(env.A.value, "\none\ntwo\n");
    assert.equal(env.B.value, "two");
  });

  it("handles an explicit indentation indicator", () => {
    const env = parseYaml(["A: |2", "    indented", "  base", "B: b"].join("\n"));

    assert.equal(env.A.value, "  indented\nbase\n");
    assert.equal(env.B.value, "b");
  });

  it("strips quotes and inline comments from flat values", () => {
    const env = parseYaml(
      [
        "# leading comment",
        "# second line",
        'QUOTED: "a value" # trailing',
        "SINGLE: 'it''s here'",
        "COLONS: postgres://user:pass@host:5432/db",
        "EMPTY:",
        "NUMBER: 3000",
        "BOOL: true"
      ].join("\n")
    );

    assert.deepEqual(env.QUOTED.comments, ["leading comment", "second line", "trailing"]);
    assert.equal(env.QUOTED.value, "a value");
    assert.equal(env.SINGLE.value, "it's here");
    assert.equal(env.COLONS.value, "postgres://user:pass@host:5432/db");
    assert.equal(env.EMPTY.value, "");
    assert.equal(env.NUMBER.value, "3000");
    assert.equal(env.BOOL.value, "true");
  });

  it("stringifies nested maps and sequences", () => {
    const env = parseYaml(["MAP:", "  a: 1", "LIST:", "  - one", "  - two"].join("\n"));

    assert.equal(env.MAP.value, '{"a":1}');
    assert.equal(env.LIST.value, '["one","two"]');
  });

  it("returns nothing for documents that are not maps", () => {
    assert.deepEqual(parseYaml(""), {});
    assert.deepEqual(parseYaml("- one\n- two"), {});
  });

  it("throws on invalid yaml", () => {
    assert.throws(() => parseYaml(["A: 1", " B: 2", "C: 3"].join("\n")));
    assert.throws(() => parseYaml("A: 1\nA: 2"));
  });
});

describe("parseDotEnv", () => {
  it("parses assignments, exports and quoted values", () => {
    const env = parseDotEnv(
      [
        "# a comment",
        'APP_NAME="example-service"',
        "export TOKEN=abc123",
        'MULTI="one\\ntwo"',
        "BARE=plain # trailing"
      ].join("\n")
    );

    assert.deepEqual(env.APP_NAME, { value: "example-service", comments: ["a comment"] });
    assert.equal(env.TOKEN.value, "abc123");
    assert.equal(env.MULTI.value, "one\ntwo");
    assert.equal(env.BARE.value, "plain");
  });
});

describe("parsePastedSecrets", () => {
  it("parses json", () => {
    const env = parsePastedSecrets('{"A":"1","B":{"c":2}}');

    assert.equal(env.A.value, "1");
    assert.equal(env.B.value, '{"c":2}');
  });

  it("parses yaml block scalars rather than falling back to dotenv", () => {
    const env = parsePastedSecrets(["FOO: |", "  first line", "  second"].join("\n"));

    assert.deepEqual(Object.keys(env), ["FOO"]);
    assert.equal(env.FOO.value, "first line\nsecond\n");
  });

  it("treats assignments inside a block scalar as part of its value", () => {
    const env = parsePastedSecrets(["ENV_FILE: |", "  A=1", "  B=2"].join("\n"));

    assert.deepEqual(Object.keys(env), ["ENV_FILE"]);
    assert.equal(env.ENV_FILE.value, "A=1\nB=2\n");
  });

  it("still parses dotenv content as dotenv", () => {
    const env = parsePastedSecrets(["A=1", "export B=2", 'C="three"'].join("\n"));

    assert.equal(env.A.value, "1");
    assert.equal(env.B.value, "2");
    assert.equal(env.C.value, "three");
  });

  it("parses flat yaml", () => {
    const env = parsePastedSecrets(
      ["APP_NAME: example-service", "NODE_ENV: production"].join("\n")
    );

    assert.equal(env.APP_NAME.value, "example-service");
    assert.equal(env.NODE_ENV.value, "production");
  });

  it("falls back to dotenv when yaml is invalid", () => {
    const env = parsePastedSecrets(["A: 1", " B: 2"].join("\n"));

    assert.equal(env.A.value, "1");
    assert.equal(env.B.value, "2");
  });
});
