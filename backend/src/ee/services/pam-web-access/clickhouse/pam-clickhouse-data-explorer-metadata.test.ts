import { describe, expect, test } from "vitest";

import { TColumnRow, toColumns, toPrimaryKeys } from "./pam-clickhouse-data-explorer-metadata";

const rows: TColumnRow[] = [
  { name: "id", type: "UInt64", nullable: 0, isInPrimaryKey: 1 },
  { name: "tenant", type: "String", nullable: 0, isInPrimaryKey: 1 },
  { name: "note", type: "Nullable(String)", nullable: 1, isInPrimaryKey: 0 }
];

describe("toColumns", () => {
  test("reads nullability off the UInt8 flag and reports no identity columns", () => {
    expect(toColumns(rows)).toEqual([
      { name: "id", type: "UInt64", nullable: false, identityGeneration: null },
      { name: "tenant", type: "String", nullable: false, identityGeneration: null },
      { name: "note", type: "Nullable(String)", nullable: true, identityGeneration: null }
    ]);
  });

  test("accepts the flag as a boolean or a string", () => {
    expect(toColumns([{ name: "a", type: "String", nullable: true, isInPrimaryKey: 0 }])[0].nullable).toBe(true);
    expect(
      toColumns([{ name: "a", type: "String", nullable: "1" as unknown as number, isInPrimaryKey: 0 }])[0].nullable
    ).toBe(true);
  });
});

describe("toPrimaryKeys", () => {
  test("keeps the sorting key columns in their declared order", () => {
    expect(toPrimaryKeys(rows)).toEqual(["id", "tenant"]);
  });

  test("a table with no sorting key has none", () => {
    expect(toPrimaryKeys([{ name: "a", type: "String", nullable: 0, isInPrimaryKey: 0 }])).toEqual([]);
  });
});
