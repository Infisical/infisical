import { describe, expect, test } from "vitest";

import { getSchemasQuery, getTableDetailQuery, getTablesQuery } from "./pam-postgres-data-browser-metadata";

describe("getSchemasQuery", () => {
  test("returns SQL with no parameters", () => {
    const query = getSchemasQuery();
    expect(query.text).toContain("pg_namespace");
    expect(query.text).toContain("pg_catalog");
    expect(query.text).toContain("information_schema");
    expect(query.values).toEqual([]);
  });

  test("excludes system schemas", () => {
    const query = getSchemasQuery();
    expect(query.text).toContain("pg_toast");
    expect(query.text).toContain("pg_temp_");
  });
});

describe("getTablesQuery", () => {
  test("returns parameterized query for schema", () => {
    const query = getTablesQuery("public");
    expect(query.values).toEqual(["public"]);
    expect(query.text).toContain("$1");
    expect(query.text).toContain("pg_class");
    expect(query.text).toContain("relkind");
  });

  test("includes table type mapping", () => {
    const query = getTablesQuery("myschema");
    expect(query.text).toContain("'table'");
    expect(query.text).toContain("'view'");
    expect(query.text).toContain("'materialized_view'");
  });
});

describe("getTableDetailQuery", () => {
  test("returns parameterized query for schema and table", () => {
    const query = getTableDetailQuery("public", "users");
    expect(query.values).toEqual(["public", "users"]);
    expect(query.text).toContain("$1");
    expect(query.text).toContain("$2");
  });

  test("queries columns from pg_attribute", () => {
    const query = getTableDetailQuery("public", "users");
    expect(query.text).toContain("pg_attribute");
    expect(query.text).toContain("pg_type");
  });

  test("queries primary keys from pg_constraint", () => {
    const query = getTableDetailQuery("public", "users");
    expect(query.text).toContain("contype = 'p'");
  });

  // TODO: re-enable when UI needs foreign key and enum data
  // test("queries foreign keys from pg_constraint", () => {
  //   const query = getTableDetailQuery("public", "users");
  //   expect(query.text).toContain("contype = 'f'");
  // });

  // test("queries enum values from pg_enum", () => {
  //   const query = getTableDetailQuery("public", "users");
  //   expect(query.text).toContain("pg_enum");
  // });

  test("returns JSON result", () => {
    const query = getTableDetailQuery("public", "users");
    expect(query.text).toContain("json_build_object");
    expect(query.text).toContain("'columns'");
    expect(query.text).toContain("'primaryKeys'");
  });
});
