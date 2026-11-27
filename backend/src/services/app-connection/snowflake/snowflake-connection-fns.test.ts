import { describe, expect, test } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import { assertSnowflakeStatementSupported } from "./snowflake-connection-fns";

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
