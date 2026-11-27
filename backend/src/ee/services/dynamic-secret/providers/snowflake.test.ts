import { beforeEach, describe, expect, test, vi } from "vitest";

import { TDynamicSecrets } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";

import { SnowflakeProvider } from "./snowflake";

const { client, createConnection } = vi.hoisted(() => {
  const mockClient = {
    connectAsync: vi.fn(() => Promise.resolve()),
    execute: vi.fn((options: { complete: (err?: Error) => void }) => options.complete()),
    destroy: vi.fn()
  };
  return { client: mockClient, createConnection: vi.fn(() => mockClient) };
});

vi.mock("snowflake-sdk", () => ({ default: { createConnection } }));

const metadata = { projectId: "proj-1" };

const inputs = (overrides: { creationStatement?: string; revocationStatement?: string; renewStatement?: string }) => ({
  accountId: "account",
  orgId: "org",
  username: "admin",
  password: "password",
  creationStatement: "CREATE USER {{username}} PASSWORD = '{{password}}' DAYS_TO_EXPIRY = {{expiration}}",
  revocationStatement: "DROP USER {{username}}",
  renewStatement: "ALTER USER {{username}} SET DAYS_TO_EXPIRY = {{expiration}}",
  ...overrides
});

const createLease = (providerInputs: ReturnType<typeof inputs>, usernameTemplate?: string) =>
  SnowflakeProvider().create({
    inputs: providerInputs,
    expireAt: Date.now() + 60_000,
    usernameTemplate,
    identity: { name: "identity" },
    dynamicSecret: { name: "snowflake" } as TDynamicSecrets,
    metadata
  });

const executedStatements = () =>
  client.execute.mock.calls.map(([options]) => (options as unknown as { sqlText: string }).sqlText);

describe("SnowflakeProvider statements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("runs the creation, renew and revocation statements", async () => {
    const lease = await createLease(inputs({}));
    await SnowflakeProvider().renew(inputs({}), lease.entityId, Date.now() + 60_000, metadata);
    await SnowflakeProvider().revoke(inputs({}), lease.entityId, metadata);

    expect(executedStatements()).toEqual([
      expect.stringMatching(/^CREATE USER infisical_/),
      expect.stringMatching(/^ALTER USER infisical_/),
      expect.stringMatching(/^DROP USER infisical_/)
    ]);
    expect(createConnection).toHaveBeenCalledWith(
      expect.objectContaining({ arrayBindingThreshold: Number.MAX_SAFE_INTEGER })
    );
  });

  test.each([
    { creationStatement: "PUT file://data.csv @~" },
    { revocationStatement: "get @~ file://downloads" },
    { renewStatement: " PUT file://data.csv @~" }
  ])("rejects PUT and GET statements when the inputs are validated: %j", async (statements) => {
    await expect(SnowflakeProvider().validateProviderInputs(inputs(statements), metadata)).rejects.toBeInstanceOf(
      BadRequestError
    );
  });

  test.each(["PUT file://data.csv @~", "  get @~ file://downloads"])(
    "rejects lease operations on stored %j statements",
    async (statement) => {
      await expect(createLease(inputs({ creationStatement: statement }))).rejects.toBeInstanceOf(BadRequestError);
      await expect(
        SnowflakeProvider().renew(inputs({ renewStatement: statement }), "user_1", Date.now() + 60_000, metadata)
      ).rejects.toBeInstanceOf(BadRequestError);
      await expect(
        SnowflakeProvider().revoke(inputs({ revocationStatement: statement }), "user_1", metadata)
      ).rejects.toBeInstanceOf(BadRequestError);

      expect(createConnection).not.toHaveBeenCalled();
      expect(client.execute).not.toHaveBeenCalled();
    }
  );

  test("checks the statement after the username is filled in", async () => {
    await expect(
      createLease(inputs({ creationStatement: "{{username}} file://data.csv @~" }), "put_{{randomUsername}}")
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(client.execute).not.toHaveBeenCalled();
  });
});
