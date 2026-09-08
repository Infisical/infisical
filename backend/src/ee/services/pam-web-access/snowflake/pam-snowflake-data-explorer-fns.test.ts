import { describe, expect, test } from "vitest";

import { extractCommand, nextTransactionState, splitSnowflakeStatements } from "./pam-snowflake-data-explorer-fns";

describe("splitSnowflakeStatements", () => {
  test("single statement with and without a trailing semicolon", () => {
    expect(splitSnowflakeStatements("SELECT 1")).toEqual(["SELECT 1"]);
    expect(splitSnowflakeStatements("SELECT 1;")).toEqual(["SELECT 1"]);
  });

  test("multiple statements", () => {
    expect(splitSnowflakeStatements("SELECT 1; SELECT 2; SELECT 3")).toEqual(["SELECT 1", "SELECT 2", "SELECT 3"]);
  });

  test("drops empty statements and whitespace-only input", () => {
    expect(splitSnowflakeStatements("SELECT 1;; ;SELECT 2")).toEqual(["SELECT 1", "SELECT 2"]);
    expect(splitSnowflakeStatements("")).toEqual([]);
    expect(splitSnowflakeStatements("   \n\t  ")).toEqual([]);
  });

  test("semicolon inside a string literal", () => {
    expect(splitSnowflakeStatements("SELECT 'a;b'; SELECT 2")).toEqual(["SELECT 'a;b'", "SELECT 2"]);
  });

  test("semicolon inside a quoted identifier", () => {
    expect(splitSnowflakeStatements('SELECT "col;name" FROM t; SELECT 2')).toEqual([
      'SELECT "col;name" FROM t',
      "SELECT 2"
    ]);
  });

  test("escaped quotes inside a literal", () => {
    expect(splitSnowflakeStatements("SELECT 'it''s;fine'; SELECT 2")).toEqual(["SELECT 'it''s;fine'", "SELECT 2"]);
    expect(splitSnowflakeStatements("SELECT 'a\\';b'; SELECT 2")).toEqual(["SELECT 'a\\';b'", "SELECT 2"]);
  });

  test("semicolons inside a dollar-quoted block", () => {
    expect(splitSnowflakeStatements("EXECUTE IMMEDIATE $$ BEGIN; SELECT 1; END; $$; SELECT 2")).toEqual([
      "EXECUTE IMMEDIATE $$ BEGIN; SELECT 1; END; $$",
      "SELECT 2"
    ]);
  });

  test("semicolon inside comments", () => {
    expect(splitSnowflakeStatements("SELECT 1 -- a;b\n; SELECT 2")).toEqual(["SELECT 1 -- a;b", "SELECT 2"]);
    expect(splitSnowflakeStatements("SELECT 1 // a;b\n; SELECT 2")).toEqual(["SELECT 1 // a;b", "SELECT 2"]);
    expect(splitSnowflakeStatements("SELECT 1 /* a;b */; SELECT 2")).toEqual(["SELECT 1 /* a;b */", "SELECT 2"]);
  });

  test("unterminated literal keeps the rest of the input in one statement", () => {
    expect(splitSnowflakeStatements("SELECT 'a; SELECT 2")).toEqual(["SELECT 'a; SELECT 2"]);
  });

  test("a backslash escapes inside a literal but not inside a quoted identifier", () => {
    expect(splitSnowflakeStatements(String.raw`SELECT 'a\'; b'; SELECT 2`)).toEqual([
      String.raw`SELECT 'a\'; b'`,
      "SELECT 2"
    ]);
    expect(splitSnowflakeStatements(String.raw`SELECT "a\"; SELECT 2`)).toEqual([String.raw`SELECT "a\"`, "SELECT 2"]);
  });
});

describe("extractCommand", () => {
  test("reads the leading keyword, uppercased", () => {
    expect(extractCommand("select * from t")).toBe("SELECT");
    expect(extractCommand("  \n  BEGIN")).toBe("BEGIN");
  });

  test("skips leading comments", () => {
    expect(extractCommand("-- note\nCOMMIT")).toBe("COMMIT");
    expect(extractCommand("// note\nROLLBACK")).toBe("ROLLBACK");
    expect(extractCommand("/* note */ INSERT INTO t VALUES (1)")).toBe("INSERT");
  });

  test("stops at a delimiter", () => {
    expect(extractCommand("COMMIT;")).toBe("COMMIT");
    expect(extractCommand("SELECT(1)")).toBe("SELECT");
  });

  test("empty input", () => {
    expect(extractCommand("   ")).toBe("");
  });
});

describe("nextTransactionState", () => {
  test("BEGIN and START open a transaction", () => {
    expect(nextTransactionState("BEGIN", false)).toBe(true);
    expect(nextTransactionState("START", false)).toBe(true);
  });

  test("COMMIT and ROLLBACK close it", () => {
    expect(nextTransactionState("COMMIT", true)).toBe(false);
    expect(nextTransactionState("ROLLBACK", true)).toBe(false);
  });

  test("any other statement leaves the state alone", () => {
    expect(nextTransactionState("SELECT", true)).toBe(true);
    expect(nextTransactionState("SELECT", false)).toBe(false);
  });
});
