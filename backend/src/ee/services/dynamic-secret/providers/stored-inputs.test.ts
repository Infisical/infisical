import { describe, expect, test } from "vitest";

import { SnowflakeProvider } from "./snowflake";
import { validateStoredProviderInputs } from "./stored-inputs";

const stored = {
  orgId: "example-org",
  accountId: "example-account",
  username: "svc",
  password: "unused",
  creationStatement: "PUT file://data.csv @~",
  revocationStatement: "DROP USER {{username}}"
};

describe("validateStoredProviderInputs", () => {
  test("loads a stored Snowflake config with an unsupported statement, which a clean update can replace", async () => {
    const provider = SnowflakeProvider();
    const update = { ...stored, creationStatement: "CREATE USER {{username}} PASSWORD = '{{password}}'" };

    await expect(validateStoredProviderInputs(provider, stored, "project-1")).resolves.toEqual(stored);
    await expect(provider.validateProviderInputs(update, { projectId: "project-1" })).resolves.toMatchObject(update);
  });
});
