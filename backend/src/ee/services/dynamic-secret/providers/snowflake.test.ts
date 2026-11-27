import { describe, expect, test } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import { parseSnowflakeProviderInputs, renderSnowflakeStatement, SnowflakeProvider } from "./snowflake";

const inputs = {
  orgId: "example-org",
  accountId: "example-account",
  username: "svc",
  password: "unused",
  creationStatement: "CREATE USER {{username}} PASSWORD = '{{password}}'",
  revocationStatement: "DROP USER {{username}}"
};

describe("Snowflake statements by action", () => {
  test("parses stored inputs whose other statements are PUT or GET, for revoke and renew", async () => {
    const stored = await parseSnowflakeProviderInputs({ ...inputs, creationStatement: "PUT file://data.csv @~" });

    expect(renderSnowflakeStatement(stored.revocationStatement, { username: "svc_1" })).toBe("DROP USER svc_1");
  });

  test("refuses a statement that starts with PUT once rendered", () => {
    expect(() => renderSnowflakeStatement("{{username}} file://data.csv @~", { username: "put_svc" })).toThrow(
      BadRequestError
    );
  });

  test("full validation, which lease creation uses, refuses a PUT or GET revocation statement", async () => {
    const unsupported = { ...inputs, revocationStatement: "GET @~ file://downloads" };

    await expect(SnowflakeProvider().validateProviderInputs(unsupported, { projectId: "p" })).rejects.toThrow(
      BadRequestError
    );
  });
});
