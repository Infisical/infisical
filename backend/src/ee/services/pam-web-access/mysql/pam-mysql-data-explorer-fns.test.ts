import { describe, expect, test } from "vitest";

import { extractCommand, splitMysqlStatements } from "./pam-mysql-data-explorer-fns";

describe("splitMysqlStatements", () => {
  test("single statement without semicolon", () => {
    expect(splitMysqlStatements("SELECT 1")).toEqual(["SELECT 1"]);
  });

  test("single statement with trailing semicolon", () => {
    expect(splitMysqlStatements("SELECT 1;")).toEqual(["SELECT 1"]);
  });

  test("multiple statements", () => {
    expect(splitMysqlStatements("SELECT 1; SELECT 2; SELECT 3")).toEqual(["SELECT 1", "SELECT 2", "SELECT 3"]);
  });

  test("ignores empty statements", () => {
    expect(splitMysqlStatements("SELECT 1;; ;SELECT 2")).toEqual(["SELECT 1", "SELECT 2"]);
  });

  test("empty input", () => {
    expect(splitMysqlStatements("")).toEqual([]);
  });

  test("whitespace only", () => {
    expect(splitMysqlStatements("   \n\t  ")).toEqual([]);
  });

  test("semicolon inside single-quoted string", () => {
    expect(splitMysqlStatements("SELECT 'a;b'; SELECT 2")).toEqual(["SELECT 'a;b'", "SELECT 2"]);
  });

  test("semicolon inside double-quoted string", () => {
    expect(splitMysqlStatements('SELECT "a;b"; SELECT 2')).toEqual(['SELECT "a;b"', "SELECT 2"]);
  });

  test("semicolon inside backtick-quoted identifier", () => {
    expect(splitMysqlStatements("SELECT `col;name` FROM t; SELECT 2")).toEqual([
      "SELECT `col;name` FROM t",
      "SELECT 2"
    ]);
  });

  test("escaped quote inside string", () => {
    expect(splitMysqlStatements("SELECT 'it\\'s'; SELECT 2")).toEqual(["SELECT 'it\\'s'", "SELECT 2"]);
  });

  test("semicolon inside line comment", () => {
    expect(splitMysqlStatements("SELECT 1 -- ; not a split\n; SELECT 2")).toEqual([
      "SELECT 1 -- ; not a split",
      "SELECT 2"
    ]);
  });

  test("semicolon inside hash comment", () => {
    expect(splitMysqlStatements("SELECT 1 # ; not a split\n; SELECT 2")).toEqual([
      "SELECT 1 # ; not a split",
      "SELECT 2"
    ]);
  });

  test("semicolon inside block comment", () => {
    expect(splitMysqlStatements("SELECT 1 /* ; still one */ ; SELECT 2")).toEqual([
      "SELECT 1 /* ; still one */",
      "SELECT 2"
    ]);
  });

  test("multi-line block comment", () => {
    expect(
      splitMysqlStatements(`SELECT 1 /*
; not a split
; still not
*/; SELECT 2`)
    ).toEqual([
      `SELECT 1 /*
; not a split
; still not
*/`,
      "SELECT 2"
    ]);
  });

  test("transaction statements", () => {
    expect(splitMysqlStatements("BEGIN; INSERT INTO t VALUES (1); COMMIT")).toEqual([
      "BEGIN",
      "INSERT INTO t VALUES (1)",
      "COMMIT"
    ]);
  });

  test("mixed quoting styles", () => {
    expect(splitMysqlStatements(`SELECT "a;b", 'c;d', \`e;f\`; SELECT 2`)).toEqual([
      "SELECT \"a;b\", 'c;d', `e;f`",
      "SELECT 2"
    ]);
  });

  test("doubled-quote escape in single-quoted string", () => {
    expect(splitMysqlStatements("SELECT 'it''s here; still one'; SELECT 2")).toEqual([
      "SELECT 'it''s here; still one'",
      "SELECT 2"
    ]);
  });

  test("doubled-quote escape in double-quoted string", () => {
    expect(splitMysqlStatements('SELECT "a""b;c"; SELECT 2')).toEqual(['SELECT "a""b;c"', "SELECT 2"]);
  });

  test("doubled backtick in identifier", () => {
    expect(splitMysqlStatements("SELECT `col``; name` FROM t; SELECT 2")).toEqual([
      "SELECT `col``; name` FROM t",
      "SELECT 2"
    ]);
  });

  test("double-dash without trailing space is not a line comment", () => {
    expect(splitMysqlStatements("SELECT 1--1; SELECT 2")).toEqual(["SELECT 1--1", "SELECT 2"]);
  });

  test("double-dash with trailing space is a line comment", () => {
    expect(splitMysqlStatements("SELECT 1 -- comment\n; SELECT 2")).toEqual(["SELECT 1 -- comment", "SELECT 2"]);
  });

  test("double-dash at end of input is a line comment", () => {
    expect(splitMysqlStatements("SELECT 1 --")).toEqual(["SELECT 1 --"]);
  });

  test("double-dash with tab is a line comment", () => {
    expect(splitMysqlStatements("SELECT 1 --\tcomment\n; SELECT 2")).toEqual(["SELECT 1 --\tcomment", "SELECT 2"]);
  });

  test("backtick identifier with backslash is not escaped", () => {
    expect(splitMysqlStatements("SELECT `col\\`; SELECT 2")).toEqual(["SELECT `col\\`", "SELECT 2"]);
  });

  test("backslash in single-quoted string still escapes", () => {
    expect(splitMysqlStatements("SELECT 'a\\';b'; SELECT 2")).toEqual(["SELECT 'a\\';b'", "SELECT 2"]);
  });

  test("unterminated single-quoted string", () => {
    expect(splitMysqlStatements("SELECT 'abc")).toEqual(["SELECT 'abc"]);
  });

  test("unterminated block comment", () => {
    expect(splitMysqlStatements("SELECT 1 /* oops")).toEqual(["SELECT 1 /* oops"]);
  });
});

describe("extractCommand", () => {
  test("simple SELECT", () => {
    expect(extractCommand("SELECT 1")).toBe("SELECT");
  });

  test("leading whitespace", () => {
    expect(extractCommand("  \n  INSERT INTO t VALUES (1)")).toBe("INSERT");
  });

  test("leading line comment", () => {
    expect(extractCommand("-- comment\nBEGIN")).toBe("BEGIN");
  });

  test("leading hash comment", () => {
    expect(extractCommand("# comment\nCOMMIT")).toBe("COMMIT");
  });

  test("leading block comment", () => {
    expect(extractCommand("/* note */ ROLLBACK")).toBe("ROLLBACK");
  });

  test("multiple leading comments", () => {
    expect(extractCommand("-- first\n/* second */ # third\nDELETE FROM t")).toBe("DELETE");
  });

  test("double-dash without space is not a comment in extractCommand", () => {
    expect(extractCommand("--nospc")).toBe("--NOSPC");
  });

  test("START TRANSACTION", () => {
    expect(extractCommand("START TRANSACTION")).toBe("START");
  });

  test("empty input", () => {
    expect(extractCommand("")).toBe("");
  });

  test("only comments", () => {
    expect(extractCommand("-- just a comment\n")).toBe("");
  });
});
