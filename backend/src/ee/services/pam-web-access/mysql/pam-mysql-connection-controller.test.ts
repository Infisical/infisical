import { describe, expect, test } from "vitest";

import { splitMysqlStatements } from "./pam-mysql-data-explorer-fns";

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
});
