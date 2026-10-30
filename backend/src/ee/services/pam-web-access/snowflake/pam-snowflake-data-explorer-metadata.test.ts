import { describe, expect, test } from "vitest";

import { toColumns, toForeignKeys, toPrimaryKeys } from "./pam-snowflake-data-explorer-metadata";

describe("toPrimaryKeys", () => {
  test("orders columns by key sequence", () => {
    expect(
      toPrimaryKeys([
        { column_name: "b", key_sequence: 2 },
        { column_name: "a", key_sequence: 1 }
      ])
    ).toEqual(["a", "b"]);
  });

  test("reads uppercase column names", () => {
    expect(toPrimaryKeys([{ COLUMN_NAME: "ID", KEY_SEQUENCE: 1 }])).toEqual(["ID"]);
  });

  test("no primary key", () => {
    expect(toPrimaryKeys([])).toEqual([]);
  });
});

describe("toForeignKeys", () => {
  test("groups a composite key into one constraint, ordered by key sequence", () => {
    expect(
      toForeignKeys([
        {
          fk_name: "FK_ORDER",
          fk_column_name: "tenant_id",
          pk_column_name: "id_tenant",
          pk_schema_name: "PUBLIC",
          pk_table_name: "TENANT",
          key_sequence: 2
        },
        {
          fk_name: "FK_ORDER",
          fk_column_name: "org_id",
          pk_column_name: "id_org",
          pk_schema_name: "PUBLIC",
          pk_table_name: "TENANT",
          key_sequence: 1
        }
      ])
    ).toEqual([
      {
        constraintName: "FK_ORDER",
        columns: ["org_id", "tenant_id"],
        targetColumns: ["id_org", "id_tenant"],
        targetSchema: "PUBLIC",
        targetTable: "TENANT"
      }
    ]);
  });

  test("keeps separate constraints apart", () => {
    const result = toForeignKeys([
      { fk_name: "FK_A", fk_column_name: "a", pk_column_name: "x", pk_schema_name: "S", pk_table_name: "T" },
      { fk_name: "FK_B", fk_column_name: "b", pk_column_name: "y", pk_schema_name: "S", pk_table_name: "U" }
    ]);
    expect(result.map((fk) => fk.constraintName)).toEqual(["FK_A", "FK_B"]);
  });
});

describe("toColumns", () => {
  test("maps nullability and identity generation", () => {
    expect(
      toColumns([
        { name: "id", type: "NUMBER", isNullable: "NO", identityGeneration: "BY DEFAULT" },
        { name: "note", type: "TEXT", isNullable: "YES", identityGeneration: null }
      ])
    ).toEqual([
      { name: "id", type: "NUMBER", nullable: false, identityGeneration: "BY DEFAULT" },
      { name: "note", type: "TEXT", nullable: true, identityGeneration: null }
    ]);
  });
});
