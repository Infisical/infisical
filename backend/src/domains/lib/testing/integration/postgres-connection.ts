import knex, { Knex } from "knex";

import type { TDbClient } from "@app/db";

import { DATABASE_PREFIX } from "./run";

// No vitest runtime imports here: global-setup.ts runs in Vitest's main process and imports this file.

export type TPostgresServer = {
  host: string;
  port: number;
  user: string;
  password: string;
  // The database the harness connects to for CREATE and DROP DATABASE.
  maintenanceDatabase: string;
};

export const parsePostgresUrl = (url: string): TPostgresServer => {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    maintenanceDatabase: parsed.pathname.replace(/^\//, "") || "postgres"
  };
};

export const connectionUri = (server: TPostgresServer, database: string) =>
  `postgres://${encodeURIComponent(server.user)}:${encodeURIComponent(server.password)}@${server.host}:${server.port}/${encodeURIComponent(database)}`;

export const assertHarnessDatabaseName = (name: string) => {
  if (!name.startsWith(DATABASE_PREFIX) || !/^[a-z0-9_]+$/.test(name)) {
    throw new Error(
      `Refusing to touch database "${name}": the integration harness only creates and drops databases named ${DATABASE_PREFIX}*`
    );
  }
};

// A single connection, so a session-level advisory lock is released on the connection that took it.
export const connectMaintenance = (server: TPostgresServer) =>
  knex({
    client: "pg",
    connection: connectionUri(server, server.maintenanceDatabase),
    pool: { min: 1, max: 1 }
  });

export const databaseExists = async (admin: Knex, name: string) => {
  const row = await admin.raw<{ rows: unknown[] }>("SELECT 1 FROM pg_database WHERE datname = ?", [name]);
  return row.rows.length > 0;
};

export const createDatabase = async (admin: Knex, name: string, template?: string) => {
  assertHarnessDatabaseName(name);
  if (template) {
    await admin.raw("CREATE DATABASE ?? TEMPLATE ??", [name, template]);
  } else {
    await admin.raw("CREATE DATABASE ??", [name]);
  }
};

// force ends the sessions still connected to it; without it, a database in use is left alone and the drop fails.
export const dropDatabase = async (admin: Knex, name: string, { force = true }: { force?: boolean } = {}) => {
  assertHarnessDatabaseName(name);
  await admin.raw(force ? "DROP DATABASE IF EXISTS ?? WITH (FORCE)" : "DROP DATABASE IF EXISTS ??", [name]);
};

export const listHarnessDatabases = async (admin: Knex, prefix: string) => {
  assertHarnessDatabaseName(prefix);
  const result = await admin.raw<{ rows: { datname: string }[] }>(
    "SELECT datname FROM pg_database WHERE starts_with(datname, ?)",
    [prefix]
  );
  return result.rows.map((row) => row.datname);
};

/*
 * Production builds its client with initDbConnection, which adds primaryNode() and replicaNode()
 * to knex's global QueryBuilder and returns the one client from a closure. Knex refuses to
 * register a method twice, so that works once per process, and a test file can hold several
 * databases (the worker's, a fresh one, an empty target). Here the methods are registered once
 * and look the client up by its config, which a transaction's client shares with the client it
 * came from, so every database (and every transaction on it) resolves to its own. The
 * registry lives on globalThis because knex is loaded once per process while this module can be
 * evaluated once per test file.
 */
const registryKey = Symbol.for("infisical.integration-test.knex-by-client");

type TRegistry = WeakMap<object, TDbClient>;

const registry = (): TRegistry => {
  const holder = globalThis as unknown as Record<symbol, TRegistry | undefined>;
  const existing = holder[registryKey];
  if (existing) return existing;

  const created: TRegistry = new WeakMap();
  const lookup = function lookup(this: { client: { config: object } }) {
    const client = created.get(this.client.config);
    if (!client)
      throw new Error("primaryNode() / replicaNode() called on a client the integration harness did not create");
    return client;
  };
  try {
    knex.QueryBuilder.extend("primaryNode", lookup as never);
    knex.QueryBuilder.extend("replicaNode", lookup as never);
  } catch (err) {
    throw new Error(
      "initDbConnection() already ran in this test process. Integration tests get their database from setupIntegration(), never initDbConnection().",
      { cause: err }
    );
  }
  holder[registryKey] = created;
  return created;
};

export const connectDatabase = (server: TPostgresServer, database: string): TDbClient => {
  const knownClients = registry();
  const db = knex({
    client: "pg",
    connection: connectionUri(server, database),
    pool: { min: 0, max: 10 },
    migrations: { tableName: "infisical_migrations" }
  }) as TDbClient;
  knownClients.set((db.client as { config: object }).config, db);
  return db;
};
