import { Readable } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { TSecretRotationV2Raw } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";

import { clickhouseCredentialsRotationFactory } from "./clickhouse-credentials-rotation-fns";
import { TClickHouseCredentialsRotationWithConnection } from "./clickhouse-credentials-rotation-types";

const clickhouse = vi.hoisted(() => ({
  commands: [] as string[],
  failing: false,
  agentRequests: [] as unknown[][],
  agents: [] as unknown[]
}));

vi.mock("@app/lib/validator", () => ({
  buildUncachedSsrfSafeAgent: async (...args: unknown[]) => {
    clickhouse.agentRequests.push(args);
    return "pinned-agent";
  }
}));
vi.mock("@clickhouse/client", () => ({
  parseError: (text: string) => new Error(text),
  createClient: ({ username, http_agent }: { username: string; http_agent: unknown }) => {
    clickhouse.agents.push(http_agent);
    return {
      exec: async ({ query }: { query: string }) => {
        clickhouse.commands.push(`${username}: ${query}`);
        return clickhouse.failing
          ? {
              stream: Readable.from([Buffer.from(`Cannot execute ${query}`)]),
              http_status_code: 500,
              response_headers: {}
            }
          : { stream: Readable.from([]), http_status_code: 200, response_headers: {} };
      },
      close: async () => {}
    };
  }
}));

const COMMITTED = "committed" as unknown as TSecretRotationV2Raw;
const CONNECTION_CREDENTIALS = {
  host: "clickhouse.example.com",
  port: 8443,
  database: "default",
  username: "manager",
  password: "manager-password",
  sslEnabled: true,
  sslRejectUnauthorized: true
};
const ACTIVE_CREDENTIALS = { username: "user_1", password: "active-password" };
const GATEWAY_POOL_SERVICE = {
  resolveEffectiveGatewayId: async ({ gatewayId }: { gatewayId?: string | null }) => gatewayId ?? null
};

const alterUser = (username: string) =>
  `manager: ALTER USER \`${username}\` IDENTIFIED WITH sha256_password BY '<password>'`;

const statements = () => clickhouse.commands.map((command) => command.replace(/BY '.+'$/, "BY '<password>'"));

const makeFactory = (
  overrides: Partial<Pick<TClickHouseCredentialsRotationWithConnection, "activeIndex" | "parameters">> = {}
) =>
  clickhouseCredentialsRotationFactory(
    {
      connection: { credentials: CONNECTION_CREDENTIALS },
      parameters: { username1: "user_1", username2: "user_2" },
      activeIndex: 0,
      secretsMapping: { username: "CLICKHOUSE_DB_USERNAME", password: "CLICKHOUSE_DB_PASSWORD" },
      ...overrides
    } as unknown as TClickHouseCredentialsRotationWithConnection,
    ...([{}, {}, {}, GATEWAY_POOL_SERVICE, {}] as unknown as [
      Parameters<typeof clickhouseCredentialsRotationFactory>[1],
      Parameters<typeof clickhouseCredentialsRotationFactory>[2],
      Parameters<typeof clickhouseCredentialsRotationFactory>[3],
      Parameters<typeof clickhouseCredentialsRotationFactory>[4],
      Parameters<typeof clickhouseCredentialsRotationFactory>[5]
    ])
  );

describe("ClickHouse credentials rotation", () => {
  beforeEach(() => {
    clickhouse.commands = [];
    clickhouse.failing = false;
    clickhouse.agentRequests = [];
    clickhouse.agents = [];
  });

  it("sets new passwords on both users when issued and stores the first", async () => {
    const callback = vi.fn().mockResolvedValue(COMMITTED);

    await makeFactory().issueCredentials(callback);

    expect(statements()).toEqual([alterUser("user_1"), alterUser("user_2"), "user_1: SELECT 1", "user_2: SELECT 1"]);
    expect(callback).toHaveBeenCalledWith({ username: "user_1", password: expect.any(String) as string });
  });

  it.each([
    [0, "user_2"],
    [1, "user_1"]
  ])("rotates the standby user when the active index is %i", async (activeIndex, username) => {
    const callback = vi.fn().mockResolvedValue(COMMITTED);

    await makeFactory({ activeIndex }).rotateCredentials(undefined, callback, ACTIVE_CREDENTIALS);

    expect(statements()).toEqual([alterUser(username), `${username}: SELECT 1`]);
    expect(callback).toHaveBeenCalledWith({ username, password: expect.any(String) as string });
  });

  it("connects through an agent pinned to the connection's host", async () => {
    await makeFactory().rotateCredentials(undefined, vi.fn().mockResolvedValue(COMMITTED), ACTIVE_CREDENTIALS);

    const agentRequest = ["https://clickhouse.example.com:8443", { ca: undefined, rejectUnauthorized: true }];
    expect(clickhouse.agentRequests).toEqual([agentRequest, agentRequest]);
    expect(clickhouse.agents).toEqual(["pinned-agent", "pinned-agent"]);
  });

  it("escapes backticks and backslashes in usernames", async () => {
    const factory = makeFactory({ parameters: { username1: "user_1", username2: "we`ird\\user" } });

    await factory.rotateCredentials(undefined, vi.fn().mockResolvedValue(COMMITTED), ACTIVE_CREDENTIALS);

    expect(statements()[0]).toBe(alterUser("we\\`ird\\\\user"));
  });

  it("revokes by setting new passwords on both users", async () => {
    const callback = vi.fn().mockResolvedValue(COMMITTED);

    await makeFactory().revokeCredentials(
      [ACTIVE_CREDENTIALS, { username: "user_2", password: "standby-password" }],
      callback
    );

    expect(statements()).toEqual([alterUser("user_1"), alterUser("user_2")]);
    expect(callback).toHaveBeenCalled();
  });

  it("redacts generated passwords from errors", async () => {
    clickhouse.failing = true;

    await expect(makeFactory().rotateCredentials(undefined, vi.fn(), ACTIVE_CREDENTIALS)).rejects.toThrow(
      "BY '*******************'"
    );
  });

  it("refuses the same user for both usernames", () => {
    expect(() => makeFactory({ parameters: { username1: "user_1", username2: "user_1" } })).toThrow(
      "Rotation usernames must be two different users"
    );
    expect(clickhouse.commands).toEqual([]);
  });

  it("refuses to rotate the connection user", () => {
    expect(() => makeFactory({ parameters: { username1: "manager", username2: "user_2" } })).toThrow(
      "Rotation username cannot be the same as the connection username"
    );
  });
});
