import snowflake from "snowflake-sdk";
import { describe, expect, test } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import { assertSnowflakeStatementSupported, executeSnowflakeSql } from "./snowflake-connection-fns";

describe("assertSnowflakeStatementSupported", () => {
  test.each([
    { sqlText: "PUT file://data.csv @~", rejected: true },
    { sqlText: "GET @~ file://downloads", rejected: true },
    { sqlText: "put file://data.csv @~", rejected: true },
    { sqlText: " \n\tGet @~ file://downloads", rejected: true },
    { sqlText: "GET@~ file://downloads", rejected: true },
    { sqlText: "SELECT 1", rejected: false },
    { sqlText: "SELECT GET(v, 'put') FROM t", rejected: false },
    { sqlText: "SHOW DATABASES LIKE ?", rejected: false },
    { sqlText: "LIST @~", rejected: false }
  ])("$sqlText is rejected: $rejected", ({ sqlText, rejected }) => {
    const check = () => assertSnowflakeStatementSupported(sqlText);
    if (rejected) expect(check).toThrow(BadRequestError);
    else expect(check).not.toThrow();
  });
});

// Answers every statement with the given rows and keeps what it was sent
const fakeClient = (rows: Record<string, unknown>[]) => {
  const executed: { sqlText: string; binds?: snowflake.Binds }[] = [];
  const client = {
    execute: (options: snowflake.StatementOption) => {
      executed.push({ sqlText: options.sqlText, binds: options.binds });
      options.complete?.(undefined, {} as snowflake.RowStatement, rows);
    }
  } as unknown as snowflake.Connection;
  return { client, executed };
};

describe("executeSnowflakeSql", () => {
  test("runs a supported statement with its binds and returns the rows", async () => {
    const { client, executed } = fakeClient([{ name: "ANALYTICS" }]);

    await expect(executeSnowflakeSql(client, "SHOW DATABASES LIKE ?", ["ANALYTICS"])).resolves.toEqual([
      { name: "ANALYTICS" }
    ]);
    expect(executed).toEqual([{ sqlText: "SHOW DATABASES LIKE ?", binds: ["ANALYTICS"] }]);
  });

  test("rejects a PUT statement without sending it", async () => {
    const { client, executed } = fakeClient([]);

    await expect(executeSnowflakeSql(client, "PUT file://data.csv @~")).rejects.toThrow(BadRequestError);
    expect(executed).toEqual([]);
  });
});
