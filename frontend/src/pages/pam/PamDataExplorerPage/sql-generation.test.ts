import { describe, expect, test } from "vitest";

import {
  buildCountQuery,
  buildDeleteQuery,
  buildInsertQuery,
  buildSelectQuery,
  buildUpdateQuery,
  quoteIdent,
  quoteLiteral,
  wrapInTransaction
} from "./sql-generation";

describe("quoteIdent", () => {
  test("quotes a regular name", () => {
    expect(quoteIdent("users")).toBe('"users"');
  });

  test("escapes embedded double quotes", () => {
    expect(quoteIdent('my"table')).toBe('"my""table"');
  });

  test("handles reserved words", () => {
    expect(quoteIdent("select")).toBe('"select"');
  });
});

describe("quoteLiteral", () => {
  test("returns NULL for null", () => {
    expect(quoteLiteral(null)).toBe("NULL");
  });

  test("returns NULL for undefined", () => {
    expect(quoteLiteral(undefined)).toBe("NULL");
  });

  test("returns number as-is", () => {
    expect(quoteLiteral(42)).toBe("42");
    expect(quoteLiteral(3.14)).toBe("3.14");
  });

  test("returns NULL for NaN/Infinity", () => {
    expect(quoteLiteral(NaN)).toBe("NULL");
    expect(quoteLiteral(Infinity)).toBe("NULL");
  });

  test("returns TRUE/FALSE for booleans", () => {
    expect(quoteLiteral(true)).toBe("TRUE");
    expect(quoteLiteral(false)).toBe("FALSE");
  });

  test("quotes strings with single quotes", () => {
    expect(quoteLiteral("hello")).toBe("'hello'");
  });

  test("escapes single quotes in strings", () => {
    expect(quoteLiteral("it's")).toBe("$$it's$$");
  });

  test("double-escapes quotes when dollar sign present", () => {
    expect(quoteLiteral("it's $5")).toBe("'it''s $5'");
  });
});

describe("buildSelectQuery", () => {
  test("builds basic SELECT", () => {
    const sql = buildSelectQuery({
      schema: "public",
      table: "users",
      filters: [],
      sorts: [],
      limit: 50,
      offset: 0,
      primaryKeys: ["id"]
    });
    expect(sql).toBe('SELECT * FROM "public"."users" ORDER BY "id" ASC LIMIT 50 OFFSET 0');
  });

  test("applies filters", () => {
    const sql = buildSelectQuery({
      schema: "public",
      table: "users",
      filters: [{ column: "name", operator: "=", value: "Alice" }],
      sorts: [],
      limit: 50,
      offset: 0
    });
    expect(sql).toContain("WHERE \"name\" = 'Alice'");
  });

  test("applies sort", () => {
    const sql = buildSelectQuery({
      schema: "public",
      table: "users",
      filters: [],
      sorts: [{ column: "name", direction: "DESC" }],
      limit: 50,
      offset: 0
    });
    expect(sql).toContain('ORDER BY "name" DESC');
  });

  test("handles IS NULL filter", () => {
    const sql = buildSelectQuery({
      schema: "public",
      table: "users",
      filters: [{ column: "email", operator: "IS NULL", value: "" }],
      sorts: [],
      limit: 50,
      offset: 0
    });
    expect(sql).toContain('"email" IS NULL');
  });

  test("handles IN filter", () => {
    const sql = buildSelectQuery({
      schema: "public",
      table: "users",
      filters: [{ column: "status", operator: "IN", value: "active, pending" }],
      sorts: [],
      limit: 50,
      offset: 0
    });
    expect(sql).toContain("\"status\" IN ('active', 'pending')");
  });
});

describe("buildCountQuery", () => {
  test("builds count query", () => {
    const sql = buildCountQuery({
      schema: "public",
      table: "users",
      filters: []
    });
    expect(sql).toBe('SELECT COUNT(*) AS count FROM "public"."users"');
  });

  test("includes WHERE clause from filters", () => {
    const sql = buildCountQuery({
      schema: "public",
      table: "users",
      filters: [{ column: "active", operator: "=", value: "true" }]
    });
    expect(sql).toContain("WHERE \"active\" = 'true'");
  });
});

describe("buildInsertQuery", () => {
  test("builds INSERT with values", () => {
    const sql = buildInsertQuery({
      schema: "public",
      table: "users",
      row: { name: "Alice", age: 30 }
    });
    expect(sql).toContain('INSERT INTO "public"."users"');
    expect(sql).toContain("RETURNING *");
  });

  test("builds DEFAULT VALUES for empty row", () => {
    const sql = buildInsertQuery({
      schema: "public",
      table: "users",
      row: {}
    });
    expect(sql).toBe('INSERT INTO "public"."users" DEFAULT VALUES RETURNING *');
  });
});

describe("buildUpdateQuery", () => {
  test("builds UPDATE with SET and WHERE", () => {
    const sql = buildUpdateQuery({
      schema: "public",
      table: "users",
      changes: { name: "Bob" },
      primaryKeyMatch: { id: 1 }
    });
    expect(sql).toBe('UPDATE "public"."users" SET "name" = \'Bob\' WHERE "id" = 1 RETURNING *');
  });

  test("handles composite primary key", () => {
    const sql = buildUpdateQuery({
      schema: "public",
      table: "user_roles",
      changes: { role: "admin" },
      primaryKeyMatch: { user_id: 1, org_id: "abc" }
    });
    expect(sql).toContain('"user_id" = 1 AND "org_id" = \'abc\'');
  });
});

describe("buildDeleteQuery", () => {
  test("builds DELETE with WHERE", () => {
    const sql = buildDeleteQuery({
      schema: "public",
      table: "users",
      primaryKeyMatch: { id: 42 }
    });
    expect(sql).toBe('DELETE FROM "public"."users" WHERE "id" = 42');
  });
});

describe("wrapInTransaction", () => {
  test("wraps statements in BEGIN/COMMIT", () => {
    const sql = wrapInTransaction(["INSERT INTO t DEFAULT VALUES", "DELETE FROM t WHERE id = 1"]);
    expect(sql).toBe("BEGIN;\nINSERT INTO t DEFAULT VALUES;\nDELETE FROM t WHERE id = 1;\nCOMMIT;");
  });
});
