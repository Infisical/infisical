import { describe, expect, it } from "vitest";

import { formatCommandResult, formatError, formatTable } from "./pam-web-access-sql-formatter";

describe("formatTable", () => {
  it("formats a simple two-column result", () => {
    const result = formatTable({
      command: "SELECT",
      rowCount: 2,
      fields: [
        { name: "id", dataTypeID: 23 },
        { name: "name", dataTypeID: 25 }
      ],
      rows: [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" }
      ]
    });

    expect(result).toContain("id");
    expect(result).toContain("name");
    expect(result).toContain("Alice");
    expect(result).toContain("Bob");
    expect(result).toContain("(2 rows)");
    expect(result).toContain("+");
    expect(result).toContain("-");
  });

  it("right-aligns numeric columns", () => {
    const result = formatTable({
      command: "SELECT",
      rowCount: 2,
      fields: [{ name: "num", dataTypeID: 23 }],
      rows: [{ num: 1 }, { num: 100 }]
    });

    const lines = result.split("\n");
    // Data rows should have right-aligned numbers
    const dataLine1 = lines[2]; // first data row
    const dataLine2 = lines[3]; // second data row
    // "1" should be padded to width of "100"
    expect(dataLine1).toContain("  1");
    expect(dataLine2).toContain("100");
  });

  it("handles NULL values as empty strings", () => {
    const result = formatTable({
      command: "SELECT",
      rowCount: 1,
      fields: [
        { name: "id", dataTypeID: 23 },
        { name: "name", dataTypeID: 25 }
      ],
      rows: [{ id: 1, name: null }]
    });

    expect(result).toContain("(1 row)");
  });

  it("zero rows with fields", () => {
    const result = formatTable({
      command: "SELECT",
      rowCount: 0,
      fields: [
        { name: "id", dataTypeID: 23 },
        { name: "name", dataTypeID: 25 }
      ],
      rows: []
    });

    expect(result).toContain("id");
    expect(result).toContain("name");
    expect(result).toContain("(0 rows)");
  });

  it("single row uses singular footer", () => {
    const result = formatTable({
      command: "SELECT",
      rowCount: 1,
      fields: [{ name: "val", dataTypeID: 23 }],
      rows: [{ val: 42 }]
    });

    expect(result).toContain("(1 row)");
    expect(result).not.toContain("(1 rows)");
  });

  it("column width matches longest value", () => {
    const result = formatTable({
      command: "SELECT",
      rowCount: 1,
      fields: [{ name: "x", dataTypeID: 25 }],
      rows: [{ x: "longvalue" }]
    });

    // The separator should be at least as wide as "longvalue"
    const lines = result.split("\n");
    const separator = lines[1];
    // "longvalue" is 9 chars, column should be at least 9 + 2 (padding) = 11
    expect(separator.length).toBeGreaterThanOrEqual(11);
  });

  it("formats Date values as ISO-like timestamps", () => {
    const result = formatTable({
      command: "SELECT",
      rowCount: 1,
      fields: [{ name: "created_at", dataTypeID: 1184 }],
      rows: [{ created_at: new Date("2026-02-05T19:04:52.000Z") }]
    });

    expect(result).toContain("2026-02-05 19:04:52");
    expect(result).not.toContain("GMT");
    expect(result).not.toContain("Coordinated Universal Time");
  });

  it("formats raw string timestamps as-is", () => {
    const result = formatTable({
      command: "SELECT",
      rowCount: 1,
      fields: [{ name: "ts", dataTypeID: 1184 }],
      rows: [{ ts: "2026-02-05 19:04:52+00" }]
    });

    expect(result).toContain("2026-02-05 19:04:52+00");
  });

  it("formats Buffer values as hex", () => {
    const result = formatTable({
      command: "SELECT",
      rowCount: 1,
      fields: [{ name: "data", dataTypeID: 17 }],
      rows: [{ data: Buffer.from([0xde, 0xad, 0xbe, 0xef]) }]
    });

    expect(result).toContain("\\xdeadbeef");
  });

  it("formats Array values with braces", () => {
    const result = formatTable({
      command: "SELECT",
      rowCount: 1,
      fields: [{ name: "tags", dataTypeID: 1009 }],
      rows: [{ tags: ["a", "b", "c"] }]
    });

    expect(result).toContain("{a,b,c}");
  });

  it("returns empty string for no fields", () => {
    const result = formatTable({
      command: "SELECT",
      rowCount: 0,
      fields: [],
      rows: []
    });

    expect(result).toBe("");
  });
});

describe("formatCommandResult", () => {
  it("INSERT with row count", () => {
    const result = formatCommandResult({
      command: "INSERT",
      rowCount: 3,
      fields: [],
      rows: []
    });
    expect(result).toBe("INSERT 0 3\n");
  });

  it("CREATE TABLE", () => {
    const result = formatCommandResult({
      command: "CREATE TABLE",
      rowCount: null,
      fields: [],
      rows: []
    });
    expect(result).toBe("CREATE TABLE\n");
  });

  it("BEGIN", () => {
    const result = formatCommandResult({
      command: "BEGIN",
      rowCount: null,
      fields: [],
      rows: []
    });
    expect(result).toBe("BEGIN\n");
  });

  it("UPDATE with row count", () => {
    const result = formatCommandResult({
      command: "UPDATE",
      rowCount: 5,
      fields: [],
      rows: []
    });
    expect(result).toBe("UPDATE 5\n");
  });

  it("DELETE with zero rows", () => {
    const result = formatCommandResult({
      command: "DELETE",
      rowCount: 0,
      fields: [],
      rows: []
    });
    expect(result).toBe("DELETE\n");
  });
});

describe("formatError", () => {
  it("formats pg error with message", () => {
    const result = formatError({ message: 'relation "nonexistent" does not exist' });
    expect(result).toBe('ERROR:  relation "nonexistent" does not exist\n');
  });

  it("includes DETAIL if present", () => {
    const result = formatError({
      message: "duplicate key violation",
      detail: "Key (id)=(1) already exists."
    });
    expect(result).toContain("ERROR:  duplicate key violation\n");
    expect(result).toContain("DETAIL:  Key (id)=(1) already exists.\n");
  });

  it("includes HINT if present", () => {
    const result = formatError({
      message: "column does not exist",
      hint: 'Perhaps you meant to reference the column "user"."name".'
    });
    expect(result).toContain("ERROR:  column does not exist\n");
    expect(result).toContain("HINT:");
  });

  it("handles non-pg errors", () => {
    const result = formatError("something went wrong");
    expect(result).toBe("ERROR:  something went wrong\n");
  });

  it("handles null/undefined", () => {
    const result = formatError(null);
    expect(result).toContain("ERROR:");
  });
});
