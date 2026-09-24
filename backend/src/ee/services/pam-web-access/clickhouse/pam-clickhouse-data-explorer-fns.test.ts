import { describe, expect, test } from "vitest";

import {
  extractCommand,
  MAX_ROWS,
  parseStatementBody,
  splitClickhouseStatements,
  toCellValue,
  toRowObjects,
  uniqueFieldNames
} from "./pam-clickhouse-data-explorer-fns";

describe("splitClickhouseStatements", () => {
  test("single statement with and without a trailing semicolon", () => {
    expect(splitClickhouseStatements("SELECT 1")).toEqual(["SELECT 1"]);
    expect(splitClickhouseStatements("SELECT 1;")).toEqual(["SELECT 1"]);
  });

  test("multiple statements", () => {
    expect(splitClickhouseStatements("SELECT 1; SELECT 2; SELECT 3")).toEqual(["SELECT 1", "SELECT 2", "SELECT 3"]);
  });

  test("drops empty statements and whitespace-only input", () => {
    expect(splitClickhouseStatements("SELECT 1;; ;SELECT 2")).toEqual(["SELECT 1", "SELECT 2"]);
    expect(splitClickhouseStatements("")).toEqual([]);
    expect(splitClickhouseStatements("   \n\t  ")).toEqual([]);
  });

  test("semicolon inside a string literal", () => {
    expect(splitClickhouseStatements("SELECT 'a;b'; SELECT 2")).toEqual(["SELECT 'a;b'", "SELECT 2"]);
  });

  test("semicolon inside a double-quoted or backtick identifier", () => {
    expect(splitClickhouseStatements('SELECT "col;name" FROM t; SELECT 2')).toEqual([
      'SELECT "col;name" FROM t',
      "SELECT 2"
    ]);
    expect(splitClickhouseStatements("SELECT `col;name` FROM t; SELECT 2")).toEqual([
      "SELECT `col;name` FROM t",
      "SELECT 2"
    ]);
  });

  test("escaped and doubled quotes inside a literal", () => {
    expect(splitClickhouseStatements("SELECT 'it''s;fine'; SELECT 2")).toEqual(["SELECT 'it''s;fine'", "SELECT 2"]);
    expect(splitClickhouseStatements("SELECT 'a\\';b'; SELECT 2")).toEqual(["SELECT 'a\\';b'", "SELECT 2"]);
  });

  test("semicolon inside every comment form ClickHouse accepts", () => {
    expect(splitClickhouseStatements("SELECT 1 -- a;b\n; SELECT 2")).toEqual(["SELECT 1 -- a;b", "SELECT 2"]);
    expect(splitClickhouseStatements("SELECT 1 # a;b\n; SELECT 2")).toEqual(["SELECT 1 # a;b", "SELECT 2"]);
    expect(splitClickhouseStatements("SELECT /* a;b */ 1; SELECT 2")).toEqual(["SELECT /* a;b */ 1", "SELECT 2"]);
  });

  test("semicolon inside a heredoc", () => {
    expect(splitClickhouseStatements("SELECT $doc$a;b$doc$; SELECT 2")).toEqual(["SELECT $doc$a;b$doc$", "SELECT 2"]);
    expect(splitClickhouseStatements("SELECT $$a;b$$; SELECT 2")).toEqual(["SELECT $$a;b$$", "SELECT 2"]);
  });

  test("semicolon inside a nested block comment", () => {
    expect(splitClickhouseStatements("SELECT /* outer /* inner; */ tail; */ 1; SELECT 2")).toEqual([
      "SELECT /* outer /* inner; */ tail; */ 1",
      "SELECT 2"
    ]);
  });

  test("an unterminated literal swallows the rest rather than splitting inside it", () => {
    expect(splitClickhouseStatements("SELECT 'oops; SELECT 2")).toEqual(["SELECT 'oops; SELECT 2"]);
  });
});

describe("extractCommand", () => {
  test("reads the leading keyword, skipping whitespace and comments", () => {
    expect(extractCommand("select 1")).toBe("SELECT");
    expect(extractCommand("  \n  INSERT INTO t VALUES (1)")).toBe("INSERT");
    expect(extractCommand("-- a comment\nCREATE TABLE t")).toBe("CREATE");
    expect(extractCommand("# a comment\nALTER TABLE t")).toBe("ALTER");
    expect(extractCommand("/* a comment */ OPTIMIZE TABLE t")).toBe("OPTIMIZE");
  });

  test("skips a nested block comment before the keyword", () => {
    expect(extractCommand("/* a /* nested */ comment */ SELECT 1")).toBe("SELECT");
  });

  test("stops at a delimiter and handles an empty statement", () => {
    expect(extractCommand("SELECT(1)")).toBe("SELECT");
    expect(extractCommand("")).toBe("");
  });
});

describe("uniqueFieldNames", () => {
  test("leaves distinct names alone and disambiguates repeats", () => {
    expect(uniqueFieldNames(["a", "b"])).toEqual(["a", "b"]);
    expect(uniqueFieldNames(["a", "a", "a"])).toEqual(["a", "a_1", "a_2"]);
  });

  test("a generated suffix never collides with a real column of that name", () => {
    expect(uniqueFieldNames(["a", "a", "a_1"])).toEqual(["a", "a_1", "a_1_1"]);
    expect(uniqueFieldNames(["a", "a_1", "a"])).toEqual(["a", "a_1", "a_2"]);
  });
});

describe("toCellValue", () => {
  test("a Map, Array or Tuple becomes the text a client would print, not an object the grid cannot render", () => {
    expect(toCellValue({ a: "b" })).toBe('{"a":"b"}');
    expect(toCellValue([1, 2, 3])).toBe("[1,2,3]");
    expect(toCellValue([1, "x"])).toBe('[1,"x"]');
  });

  test("scalars and nulls pass through untouched", () => {
    expect(toCellValue("acme")).toBe("acme");
    expect(toCellValue(7)).toBe(7);
    expect(toCellValue(null)).toBeNull();
    expect(toCellValue(undefined)).toBeNull();
  });
});

describe("toRowObjects", () => {
  test("zips column names onto positional rows", () => {
    expect(
      toRowObjects(
        ["id", "name"],
        [
          [1, "one"],
          [2, "two"]
        ]
      )
    ).toEqual([
      { id: 1, name: "one" },
      { id: 2, name: "two" }
    ]);
  });

  test("a missing value becomes null rather than undefined", () => {
    expect(toRowObjects(["id", "name"], [[1]])).toEqual([{ id: 1, name: null }]);
  });
});

describe("parseStatementBody", () => {
  const compact = (meta: string[], data: unknown[][]) =>
    JSON.stringify({ meta: meta.map((name) => ({ name, type: "String" })), data, rows: data.length });

  test("an empty body takes its row count from the summary", () => {
    expect(parseStatementBody("", { written_rows: "42" })).toEqual({
      rows: [],
      fields: [],
      rowCount: 42,
      isTruncated: false
    });
    expect(parseStatementBody("   \n ").rowCount).toBeNull();
  });

  test("reads the JSONCompact shape the session asks for", () => {
    expect(
      parseStatementBody(
        compact(
          ["id", "name"],
          [
            [1, "one"],
            [2, "two"]
          ]
        )
      )
    ).toEqual({
      rows: [
        { id: 1, name: "one" },
        { id: 2, name: "two" }
      ],
      fields: [{ name: "id" }, { name: "name" }],
      rowCount: 2,
      isTruncated: false
    });
  });

  test("a statement that asks for FORMAT JSON returns rows as objects already", () => {
    const body = JSON.stringify({
      meta: [{ name: "id", type: "UInt64" }],
      data: [{ id: 1 }, { id: 2 }],
      rows: 2
    });
    expect(parseStatementBody(body).rows).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test("caps the rows it returns and says it did", () => {
    const data = Array.from({ length: MAX_ROWS + 1 }, (_, index) => [index]);
    const result = parseStatementBody(compact(["n"], data));
    expect(result.rows).toHaveLength(MAX_ROWS);
    expect(result.rowCount).toBe(MAX_ROWS + 1);
    expect(result.isTruncated).toBe(true);
  });

  test("output the grid cannot lay out fails with a reason", () => {
    expect(() => parseStatementBody("1\tone\n2\ttwo\n")).toThrow(/FORMAT clause/);
  });

  test("a composite column arrives as text rather than an object", () => {
    const body = JSON.stringify({
      meta: [{ name: "m", type: "Map(String, String)" }],
      data: [[{ a: "b" }]],
      rows: 1
    });
    expect(parseStatementBody(body).rows).toEqual([{ m: '{"a":"b"}' }]);
  });

  test("a repeated column name still reaches the grid", () => {
    expect(parseStatementBody(compact(["a", "a"], [[1, 2]])).rows).toEqual([{ a: 1, a_1: 2 }]);
  });
});
