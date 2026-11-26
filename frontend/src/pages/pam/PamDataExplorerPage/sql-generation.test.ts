import { describe, expect, test } from "vitest";

import {
  buildCountQuery,
  buildDeleteQuery,
  buildInsertQuery,
  buildSelectQuery,
  buildUpdateQuery,
  wrapInTransaction
} from "./sql-generation";

const columns = [
  { name: "id", type: "int" },
  { name: "name", type: "nvarchar(100)" },
  { name: "balance", type: "decimal(38,10)" },
  { name: "fee", type: "money" },
  { name: "hash", type: "varbinary(16)" },
  { name: "born", type: "date" }
];
const columnTypes = Object.fromEntries(columns.map((c) => [c.name, c.type]));

describe("mssql select", () => {
  test("reads exact numerics as text and sorts by the real column", () => {
    expect(
      buildSelectQuery({
        schema: "dbo",
        table: "t]x",
        filters: [],
        sorts: [{ column: "balance", direction: "DESC" }],
        limit: 50,
        offset: 100,
        columns,
        dialect: "mssql"
      })
    ).toBe(
      "SELECT [__src].[id], [__src].[name], CONVERT(varchar(64), [__src].[balance]) AS [balance], " +
        "CONVERT(varchar(32), [__src].[fee], 2) AS [fee], [__src].[hash], [__src].[born] " +
        "FROM [dbo].[t]]x] AS [__src] ORDER BY [__src].[balance] DESC OFFSET 100 ROWS FETCH NEXT 50 ROWS ONLY"
    );
  });

  test("falls back to SELECT * and a neutral ORDER BY without metadata", () => {
    expect(
      buildSelectQuery({
        schema: "dbo",
        table: "t",
        filters: [],
        sorts: [],
        limit: 10,
        offset: 0,
        dialect: "mssql"
      })
    ).toBe(
      "SELECT * FROM [dbo].[t] AS [__src] ORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY"
    );
  });

  test("filters binary columns with a hex literal", () => {
    expect(
      buildCountQuery({
        schema: "dbo",
        table: "t",
        filters: [{ column: "hash", operator: "=", value: "0xAB01" }],
        columnTypes,
        dialect: "mssql"
      })
    ).toBe("SELECT COUNT_BIG(*) AS [count] FROM [dbo].[t] WHERE [hash] = 0xAB01");
  });

  test("never emits an unvalidated hex string unquoted", () => {
    expect(
      buildCountQuery({
        schema: "dbo",
        table: "t",
        filters: [{ column: "hash", operator: "=", value: "0x1; DROP TABLE t" }],
        columnTypes,
        dialect: "mssql"
      })
    ).toBe("SELECT COUNT_BIG(*) AS [count] FROM [dbo].[t] WHERE [hash] = N'0x1; DROP TABLE t'");
  });
});

describe("mssql writes", () => {
  test("clearing a non-text cell writes NULL, a text cell keeps the empty string", () => {
    expect(
      buildUpdateQuery({
        schema: "dbo",
        table: "t",
        changes: { born: "", name: "", balance: "" },
        primaryKeyMatch: { id: 1 },
        columnTypes,
        dialect: "mssql"
      })
    ).toBe("UPDATE [dbo].[t] SET [born] = NULL, [name] = N'', [balance] = NULL WHERE [id] = 1");
  });

  test("matches binary and exact numeric keys losslessly", () => {
    expect(
      buildDeleteQuery({
        schema: "dbo",
        table: "t",
        primaryKeyMatch: { hash: "0xABCD", balance: "12345678901234567890.1234567890" },
        columnTypes,
        dialect: "mssql"
      })
    ).toBe(
      "DELETE FROM [dbo].[t] WHERE [hash] = 0xABCD AND [balance] = N'12345678901234567890.1234567890'"
    );
  });

  test("inserts escape quotes in N'' literals", () => {
    expect(
      buildInsertQuery({
        schema: "dbo",
        table: "t",
        row: { name: "O'Brien", hash: "0x00" },
        columnTypes,
        dialect: "mssql"
      })
    ).toBe("INSERT INTO [dbo].[t] ([name], [hash]) VALUES (N'O''Brien', 0x00)");
  });

  test("wraps grid saves so any failure rolls back", () => {
    expect(wrapInTransaction(["DELETE FROM [dbo].[t] WHERE [id] = 1"], "mssql")).toBe(
      "SET XACT_ABORT ON;\nBEGIN TRY\nBEGIN TRANSACTION;\nDELETE FROM [dbo].[t] WHERE [id] = 1;\nCOMMIT TRANSACTION;\nEND TRY\n" +
        "BEGIN CATCH\nIF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;\nTHROW;\nEND CATCH"
    );
  });
});

describe("mssql typed columns", () => {
  const typed = { code: "varchar(20)", label: "nvarchar(20)", seen: "datetimeoffset(7)" };

  test("matches varchar keys with a plain literal so SQL Server can seek", () => {
    expect(
      buildDeleteQuery({
        schema: "dbo",
        table: "t",
        primaryKeyMatch: { code: "O'C42" },
        columnTypes: typed,
        dialect: "mssql"
      })
    ).toBe("DELETE FROM [dbo].[t] WHERE [code] = 'O''C42'");
  });

  test("keeps N'' for non-ASCII text in varchar columns so the code page cannot mangle it", () => {
    expect(
      buildDeleteQuery({
        schema: "dbo",
        table: "t",
        primaryKeyMatch: { code: "訂單-42" },
        columnTypes: typed,
        dialect: "mssql"
      })
    ).toBe("DELETE FROM [dbo].[t] WHERE [code] = N'訂單-42'");
  });

  test("keeps N'' literals for Unicode columns", () => {
    expect(
      buildCountQuery({
        schema: "dbo",
        table: "t",
        filters: [{ column: "label", operator: "=", value: "Zoë" }],
        columnTypes: typed,
        dialect: "mssql"
      })
    ).toBe("SELECT COUNT_BIG(*) AS [count] FROM [dbo].[t] WHERE [label] = N'Zoë'");
  });

  test("reads datetimeoffset as text so the offset survives an edit", () => {
    expect(
      buildSelectQuery({
        schema: "dbo",
        table: "t",
        filters: [],
        sorts: [],
        limit: 1,
        offset: 0,
        columns: [{ name: "seen", type: "datetimeoffset(7)" }],
        dialect: "mssql"
      })
    ).toBe(
      "SELECT CONVERT(varchar(34), [__src].[seen], 121) AS [seen] FROM [dbo].[t] AS [__src] ORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY"
    );
  });
});

describe("other dialects", () => {
  test("ignore column types", () => {
    expect(
      buildUpdateQuery({
        schema: "public",
        table: "t",
        changes: { born: "" },
        primaryKeyMatch: { id: 1 },
        columnTypes: { born: "date" },
        dialect: "postgres"
      })
    ).toBe(`UPDATE "public"."t" SET "born" = '' WHERE "id" = 1 RETURNING *`);
  });
});

describe("mssql literal edge cases", () => {
  test("keeps a backslash that ends a line", () => {
    expect(
      buildDeleteQuery({
        schema: "dbo",
        table: "t",
        primaryKeyMatch: { label: "C:\\dir\\\r\nnext", code: "a\\\nb" },
        columnTypes: { label: "nvarchar(max)", code: "varchar(20)" },
        dialect: "mssql"
      })
    ).toBe(
      "DELETE FROM [dbo].[t] WHERE [label] = CAST(N'C:\\dir\\' AS nvarchar(max)) + N'\r\nnext' AND [code] = CAST('a\\' AS varchar(max)) + '\nb'"
    );
  });

  test("matches hierarchyid keys with an unquoted binary literal", () => {
    expect(
      buildDeleteQuery({
        schema: "dbo",
        table: "t",
        primaryKeyMatch: { node: "0x58" },
        columnTypes: { node: "hierarchyid" },
        dialect: "mssql"
      })
    ).toBe("DELETE FROM [dbo].[t] WHERE [node] = 0x58");
  });
});
