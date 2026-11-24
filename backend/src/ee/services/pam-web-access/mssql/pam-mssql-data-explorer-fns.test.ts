import { describe, expect, test } from "vitest";

import { extractMssqlErrorFields } from "./pam-mssql-client";
import {
  extractCommand,
  extractLastCommand,
  extractSingleStatementCommand,
  formatMssqlValue,
  resolveMssqlTypeName,
  splitMssqlBatches,
  splitMssqlStatements,
  uniqueColumnNames
} from "./pam-mssql-data-explorer-fns";
import { groupForeignKeys } from "./pam-mssql-data-explorer-metadata";

describe("splitMssqlBatches", () => {
  test("no GO keeps one batch", () => {
    expect(splitMssqlBatches("SELECT 1;\nSELECT 2")).toEqual(["SELECT 1;\nSELECT 2"]);
  });

  test("splits on GO lines in any case", () => {
    expect(splitMssqlBatches("CREATE TABLE t (a int)\ngo\nINSERT t VALUES (1)\n  GO  \n")).toEqual([
      "CREATE TABLE t (a int)",
      "INSERT t VALUES (1)"
    ]);
  });

  test("does not split on GO inside a line", () => {
    expect(splitMssqlBatches("SELECT 'GO' AS go")).toEqual(["SELECT 'GO' AS go"]);
  });

  test("drops empty batches", () => {
    expect(splitMssqlBatches("GO\n\nGO")).toEqual([]);
  });

  test("ignores GO lines inside strings and block comments", () => {
    expect(splitMssqlBatches("SELECT 'a\nGO\nb' AS s")).toEqual(["SELECT 'a\nGO\nb' AS s"]);
    expect(splitMssqlBatches("/* x\nGO\n*/ SELECT 1\nGO\nSELECT 2")).toEqual(["/* x\nGO\n*/ SELECT 1", "SELECT 2"]);
  });

  test("repeats the batch for GO n and accepts a trailing comment", () => {
    expect(splitMssqlBatches("INSERT t VALUES (1)\nGO 3\nSELECT 1\nGO -- done")).toEqual([
      "INSERT t VALUES (1)",
      "INSERT t VALUES (1)",
      "INSERT t VALUES (1)",
      "SELECT 1"
    ]);
  });

  test("does not treat GOTO or a GO-prefixed identifier as a separator", () => {
    expect(splitMssqlBatches("GOTO done\ngoal")).toEqual(["GOTO done\ngoal"]);
  });

  test("rejects out-of-range repeat counts", () => {
    expect(() => splitMssqlBatches("SELECT 1\nGO 101")).toThrow("GO repeat count");
    expect(() => splitMssqlBatches("SELECT 1\nGO 0")).toThrow("GO repeat count");
  });
});

describe("splitMssqlStatements", () => {
  test("splits on semicolons", () => {
    expect(splitMssqlStatements("SELECT 1; SELECT 2;")).toEqual(["SELECT 1", "SELECT 2"]);
  });

  test("ignores semicolons in strings, identifiers and comments", () => {
    expect(
      splitMssqlStatements("SELECT 'a;''b', [c;]]d], \"e;f\" -- x;y\n/* p; /* q; */ r; */ FROM t; DELETE t")
    ).toEqual(["SELECT 'a;''b', [c;]]d], \"e;f\" -- x;y\n/* p; /* q; */ r; */ FROM t", "DELETE t"]);
  });
});

describe("extractCommand", () => {
  test("skips comments and whitespace", () => {
    expect(extractCommand("  -- note\n/* a /* b */ c */ update t set a = 1")).toBe("UPDATE");
  });

  test("stops at parenthesis", () => {
    expect(extractCommand("insert(a) values (1)")).toBe("INSERT");
  });
});

describe("extractSingleStatementCommand", () => {
  test("names the verb only for a single statement", () => {
    expect(extractSingleStatementCommand("UPDATE t SET a = 1;")).toBe("UPDATE");
    expect(extractSingleStatementCommand("BEGIN TRAN; DELETE FROM t")).toBe("");
  });

  test("leaves wrapped verbs unnamed", () => {
    expect(extractSingleStatementCommand("IF 1 = 1 UPDATE t SET a = 1")).toBe("");
    expect(extractSingleStatementCommand("EXEC sp_executesql N'UPDATE t SET a = 1'")).toBe("");
    expect(extractSingleStatementCommand("WITH x AS (SELECT 1 AS v) DELETE FROM t")).toBe("");
    expect(extractSingleStatementCommand("BEGIN TRY INSERT t VALUES (1) END TRY BEGIN CATCH END CATCH")).toBe("");
  });
});

describe("extractCommand with BEGIN", () => {
  test("BEGIN only counts as a transaction with TRAN, TRANSACTION or DISTRIBUTED", () => {
    expect(extractCommand("begin tran")).toBe("BEGIN");
    expect(extractCommand("BEGIN TRANSACTION t1")).toBe("BEGIN");
    expect(extractCommand("BEGIN DISTRIBUTED TRANSACTION")).toBe("BEGIN");
    expect(extractCommand("BEGIN TRY SELECT 1 END TRY BEGIN CATCH END CATCH")).toBe("");
    expect(extractCommand("BEGIN SELECT 1 END")).toBe("");
    expect(extractCommand("COMMIT")).toBe("COMMIT");
  });
});

describe("extractLastCommand", () => {
  test("uses the last statement across batches", () => {
    expect(extractLastCommand("SELECT 1\nGO\nBEGIN TRANSACTION; DELETE FROM t;")).toBe("DELETE");
  });

  test("empty input", () => {
    expect(extractLastCommand("  ")).toBe("");
  });
});

describe("formatMssqlValue", () => {
  const d = new Date(Date.UTC(2026, 0, 2, 3, 4, 5, 6));

  const withNanos = (date: Date, delta: number) => {
    Object.defineProperty(date, "nanosecondsDelta", { value: delta, enumerable: false });
    return date;
  };

  test("dates", () => {
    expect(formatMssqlValue(d, "Date")).toBe("2026-01-02");
    expect(formatMssqlValue(d, "DateTime")).toBe("2026-01-02 03:04:05.006");
    expect(formatMssqlValue(d, "SmallDateTime")).toBe("2026-01-02 03:04:05");
    expect(formatMssqlValue(d, resolveMssqlTypeName("DateTimeN", 4))).toBe("2026-01-02 03:04:05");
    expect(formatMssqlValue(d, resolveMssqlTypeName("DateTimeN", 8))).toBe("2026-01-02 03:04:05.006");
  });

  test("keeps sub-millisecond precision up to the column scale", () => {
    const precise = withNanos(new Date(Date.UTC(2024, 0, 2, 3, 4, 5, 123)), 0.0004567);
    expect(formatMssqlValue(precise, "DateTime2", 7)).toBe("2024-01-02 03:04:05.1234567");
    expect(formatMssqlValue(precise, "Time", 4)).toBe("03:04:05.1234");
    expect(formatMssqlValue(precise, "DateTimeOffset", 7)).toBe("2024-01-02 03:04:05.1234567 +00:00");
    expect(formatMssqlValue(precise, "DateTime2", 0)).toBe("2024-01-02 03:04:05");
  });

  test("pads years before 1000", () => {
    const early = new Date(0);
    early.setUTCFullYear(999, 11, 31);
    expect(formatMssqlValue(early, "Date")).toBe("0999-12-31");
  });

  test("binary as T-SQL hex literal", () => {
    expect(formatMssqlValue(Buffer.from([0xab, 0x01]), "VarBinary")).toBe("0xAB01");
  });

  test("passes other values through", () => {
    expect(formatMssqlValue(undefined, "Int")).toBeNull();
    expect(formatMssqlValue(true, "Bit")).toBe("true");
    expect(formatMssqlValue(false, "Bit")).toBe("false");
    expect(formatMssqlValue("9223372036854775807", "BigInt")).toBe("9223372036854775807");
  });
});

describe("extractMssqlErrorFields", () => {
  test("joins every error of an AggregateError", () => {
    const first = Object.assign(new Error("Permission denied."), { number: 300, class: 14, state: 1 });
    const second = Object.assign(new Error("The user does not have permission."), { number: 297, class: 16, state: 1 });
    expect(extractMssqlErrorFields(new AggregateError([first, second]))).toEqual({
      message: "Permission denied.\nThe user does not have permission.",
      detail: "Msg 300, Level 14, State 1"
    });
  });

  test("returns undefined for an empty message", () => {
    expect(extractMssqlErrorFields(new Error("")).message).toBeUndefined();
  });
});

describe("uniqueColumnNames", () => {
  test("names unnamed columns and de-duplicates", () => {
    expect(uniqueColumnNames(["", "", "id", "id"])).toEqual([
      "(No column name)",
      "(No column name) (2)",
      "id",
      "id (2)"
    ]);
  });
});

describe("groupForeignKeys", () => {
  test("groups composite keys in order", () => {
    expect(
      groupForeignKeys([
        { constraintName: "fk1", columnName: "a", targetSchema: "dbo", targetTable: "p", targetColumn: "x" },
        { constraintName: "fk1", columnName: "b", targetSchema: "dbo", targetTable: "p", targetColumn: "y" },
        { constraintName: "fk2", columnName: "c", targetSchema: "s", targetTable: "q", targetColumn: "z" }
      ])
    ).toEqual([
      { constraintName: "fk1", columns: ["a", "b"], targetSchema: "dbo", targetTable: "p", targetColumns: ["x", "y"] },
      { constraintName: "fk2", columns: ["c"], targetSchema: "s", targetTable: "q", targetColumns: ["z"] }
    ]);
  });
});
