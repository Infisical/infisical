import snowflake from "snowflake-sdk";
import { describe, expect, test, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import { executeSnowflakeSql, getSnowflakeClient, isSnowflakeFileTransferStatement } from "./snowflake-connection-fns";

const { createConnection } = vi.hoisted(() => ({
  createConnection: vi.fn(() => ({
    connectAsync: vi.fn(() => Promise.resolve()),
    isValidAsync: vi.fn(() => Promise.resolve(true)),
    destroy: vi.fn()
  }))
}));

vi.mock("snowflake-sdk", () => ({ default: { createConnection } }));

describe("isSnowflakeFileTransferStatement", () => {
  test.each([
    "PUT file://data.csv @~",
    "GET @~ file://downloads",
    "  put file://data.csv @~",
    "\nGet @~ file://downloads"
  ])("matches %j", (sqlText) => {
    expect(isSnowflakeFileTransferStatement(sqlText)).toBe(true);
  });

  test("matches on the first three characters, as the driver does", () => {
    expect(isSnowflakeFileTransferStatement("GET@~ file://downloads")).toBe(true);
    expect(isSnowflakeFileTransferStatement("PUT")).toBe(true);
  });

  test.each([
    "",
    "SELECT 1",
    "SELECT GET(v, 'put') FROM t",
    "LIST @~",
    "SHOW DATABASES",
    "/* note */ PUT file://data.csv @~"
  ])("does not match %j", (sqlText) => {
    expect(isSnowflakeFileTransferStatement(sqlText)).toBe(false);
  });
});

describe("executeSnowflakeSql", () => {
  test("rejects PUT and GET statements without running them", async () => {
    const execute = vi.fn();
    const client = { execute } as unknown as snowflake.Connection;

    await expect(executeSnowflakeSql(client, "PUT file://data.csv @~")).rejects.toBeInstanceOf(BadRequestError);
    await expect(executeSnowflakeSql(client, "get @~ file://downloads")).rejects.toBeInstanceOf(BadRequestError);
    expect(execute).not.toHaveBeenCalled();
  });

  test("runs other statements with their binds", async () => {
    const execute = vi.fn((options: snowflake.StatementOption) => {
      options.complete?.(undefined, {} as snowflake.RowStatement, [{ name: "ANALYTICS" }]);
    });
    const client = { execute } as unknown as snowflake.Connection;

    await expect(executeSnowflakeSql(client, "SHOW DATABASES LIKE ?", ["ANALYTICS"])).resolves.toEqual([
      { name: "ANALYTICS" }
    ]);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ sqlText: "SHOW DATABASES LIKE ?", binds: ["ANALYTICS"] })
    );
  });
});

describe("getSnowflakeClient", () => {
  test("sets a fixed array binding threshold on the connection", async () => {
    await getSnowflakeClient({ account: "org-account", username: "svc", password: "token" });

    expect(createConnection).toHaveBeenCalledWith(
      expect.objectContaining({ arrayBindingThreshold: Number.MAX_SAFE_INTEGER })
    );
  });
});
