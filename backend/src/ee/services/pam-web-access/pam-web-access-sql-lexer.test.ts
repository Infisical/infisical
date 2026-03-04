import { describe, expect, it } from "vitest";

import { splitStatements } from "./pam-web-access-sql-lexer";

describe("splitStatements", () => {
  // Basic cases
  it("single complete statement", () => {
    const result = splitStatements("SELECT 1;");
    expect(result.complete).toEqual(["SELECT 1"]);
    expect(result.remainder).toBe("");
  });

  it("multiple statements on one line", () => {
    const result = splitStatements("SELECT 1; SELECT 2;");
    expect(result.complete).toEqual(["SELECT 1", " SELECT 2"]);
    expect(result.remainder).toBe("");
  });

  it("incomplete statement (no ;)", () => {
    const result = splitStatements("SELECT 1");
    expect(result.complete).toEqual([]);
    expect(result.remainder).toBe("SELECT 1");
  });

  it("mixed complete + incomplete", () => {
    const result = splitStatements("SELECT 1; SELECT");
    expect(result.complete).toEqual(["SELECT 1"]);
    expect(result.remainder).toBe(" SELECT");
  });

  it("empty statements", () => {
    const result = splitStatements(";;;");
    expect(result.complete).toEqual(["", "", ""]);
    expect(result.remainder).toBe("");
  });

  it("multi-line statement", () => {
    const result = splitStatements("SELECT *\nFROM users;");
    expect(result.complete).toEqual(["SELECT *\nFROM users"]);
    expect(result.remainder).toBe("");
  });

  // Quoting
  it("semicolon inside single quotes", () => {
    const result = splitStatements("SELECT 'a;b';");
    expect(result.complete).toEqual(["SELECT 'a;b'"]);
    expect(result.remainder).toBe("");
  });

  it("escaped single quote", () => {
    const result = splitStatements("SELECT 'it''s';");
    expect(result.complete).toEqual(["SELECT 'it''s'"]);
    expect(result.remainder).toBe("");
  });

  it("dollar-quoted string", () => {
    const result = splitStatements("SELECT $$a;b$$;");
    expect(result.complete).toEqual(["SELECT $$a;b$$"]);
    expect(result.remainder).toBe("");
  });

  it("dollar-quoted with tag", () => {
    const result = splitStatements("SELECT $fn$a;b$fn$;");
    expect(result.complete).toEqual(["SELECT $fn$a;b$fn$"]);
    expect(result.remainder).toBe("");
  });

  it("dollar sign not a quote (positional param)", () => {
    const result = splitStatements("SELECT $1;");
    expect(result.complete).toEqual(["SELECT $1"]);
    expect(result.remainder).toBe("");
  });

  // Comments
  it("line comment with semicolon", () => {
    const result = splitStatements("SELECT 1; -- comment;\nSELECT 2;");
    expect(result.complete).toHaveLength(2);
    expect(result.complete[0]).toBe("SELECT 1");
    expect(result.complete[1].trim()).toContain("SELECT 2");
  });

  it("block comment with semicolon", () => {
    const result = splitStatements("SELECT /* ; */ 1;");
    expect(result.complete).toEqual(["SELECT /* ; */ 1"]);
    expect(result.remainder).toBe("");
  });

  it("nested block comments", () => {
    const result = splitStatements("SELECT /* /* ; */ */ 1;");
    expect(result.complete).toEqual(["SELECT /* /* ; */ */ 1"]);
    expect(result.remainder).toBe("");
  });

  // Edge cases
  it("empty input", () => {
    const result = splitStatements("");
    expect(result.complete).toEqual([]);
    expect(result.remainder).toBe("");
  });

  it("only whitespace", () => {
    const result = splitStatements("   ");
    expect(result.complete).toEqual([]);
    expect(result.remainder).toBe("   ");
  });

  it("only semicolons", () => {
    const result = splitStatements(";;;");
    expect(result.complete).toEqual(["", "", ""]);
    expect(result.remainder).toBe("");
  });

  it("statement after line comment", () => {
    const result = splitStatements("-- comment\nSELECT 1;");
    expect(result.complete).toHaveLength(1);
    expect(result.complete[0]).toContain("SELECT 1");
  });

  it("unclosed single quote keeps everything in remainder", () => {
    const result = splitStatements("SELECT 'unclosed;");
    expect(result.complete).toEqual([]);
    expect(result.remainder).toBe("SELECT 'unclosed;");
  });

  it("unclosed block comment keeps everything in remainder", () => {
    const result = splitStatements("SELECT /* unclosed ;");
    expect(result.complete).toEqual([]);
    expect(result.remainder).toBe("SELECT /* unclosed ;");
  });

  it("CREATE FUNCTION with dollar-quoted body", () => {
    const sql = `CREATE FUNCTION test() RETURNS void AS $$ BEGIN PERFORM 1; END; $$ LANGUAGE plpgsql;`;
    const result = splitStatements(sql);
    expect(result.complete).toHaveLength(1);
    expect(result.complete[0]).toContain("PERFORM 1;");
    expect(result.remainder).toBe("");
  });
});
