import type { Knex } from "knex";
import { describe, expect, test, vi } from "vitest";

import { SqlProviders } from "./models";
import { SqlDatabaseProvider } from "./sql-database";

const server = vi.hoisted(() => ({ versionBanner: "" }));

vi.mock("../dynamic-secret-fns", () => ({ verifyHostInputValidity: vi.fn().mockResolvedValue(["10.0.0.5"]) }));

vi.mock("knex", async (importOriginal) => {
  const { default: realKnex } = await importOriginal<typeof import("knex")>();

  const fakePgConnection = () => ({
    query: (config: string | { text: string }, callback: (err: Error | null, res: { rows: unknown[] }) => void) => {
      const sql = typeof config === "string" ? config : config.text;
      callback(null, { rows: sql === "select version();" ? [{ version: server.versionBanner }] : [] });
    },
    end: (callback: () => void) => callback()
  });

  return {
    default: (config: Knex.Config) => {
      const db = realKnex(config);
      const client = db.client as { _acquireOnlyConnection: () => Promise<ReturnType<typeof fakePgConnection>> };
      // eslint-disable-next-line no-underscore-dangle
      client._acquireOnlyConnection = async () => fakePgConnection();
      return db;
    }
  };
});

const provider = SqlDatabaseProvider({
  gatewayV2Service: { getPlatformConnectionDetailsByGatewayId: vi.fn() },
  gatewayPoolService: { resolveEffectiveGatewayId: vi.fn() }
});

const inputs = {
  client: SqlProviders.Postgres,
  host: "db.example.com",
  port: 26257,
  database: "defaultdb",
  username: "infisical",
  password: "password",
  creationStatement: "CREATE USER \"{{username}}\" WITH PASSWORD '{{password}}';",
  revocationStatement: 'DROP USER "{{username}}";'
};

describe("SqlDatabaseProvider PostgreSQL connections", () => {
  test.each([
    ["CockroachDB", "CockroachDB CCL v26.3.4 (x86_64-pc-linux-gnu, built 2026/10/27 22:16:49, go1.26.10)"],
    ["PostgreSQL", "PostgreSQL 17.2 on x86_64-pc-linux-gnu, compiled by gcc (Debian 12.2.0-14) 12.2.0, 64-bit"]
  ])("connects to a server whose version() reports %s", async (_name, versionBanner) => {
    server.versionBanner = versionBanner;

    await expect(provider.validateConnection(inputs, { projectId: "proj-1" })).resolves.toBe(true);
  });
});
