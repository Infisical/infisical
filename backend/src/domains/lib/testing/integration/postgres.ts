// knex loads the .ts migrations with require(), which bypasses Vitest's transformer.
import "tsx/cjs";

import { createHash } from "node:crypto";
import path from "node:path";

import { readdir, readFile } from "node:fs/promises";
import { Wait } from "testcontainers";

import type { TDbClient } from "@app/db";

import { container, getRunId, startOnce } from "./harness";
import {
  connectDatabase,
  connectionUri,
  connectMaintenance,
  createDatabase,
  databaseExists,
  dropDatabase,
  listHarnessDatabases,
  parsePostgresUrl,
  TPostgresServer
} from "./postgres-connection";
import { DATABASE_PREFIX, randomId, runDatabasePrefix } from "./run";

// The Postgres version docker-compose.test.yml runs the other backend suites on.
const POSTGRES_IMAGE = "postgres:14-alpine";

const MIGRATIONS_DIRECTORY = path.join(__dirname, "../../../../db/migrations");

// Any fixed number works; every run on a server builds templates under this one lock.
const TEMPLATE_LOCK_KEY = 4_716_220_118;

export type TOpenDatabase = {
  server: TPostgresServer;
  name: string;
  db: TDbClient;
  close(): Promise<void>;
};

// Durability is off since the data only lives for the run; max_locks matches the dev DB. The ready line
// logs twice because the entrypoint starts Postgres to init, stops it, then starts it for real.
const startPostgresServer = async (): Promise<TPostgresServer> => {
  if (process.env.INTEGRATION_POSTGRES_URL) return parsePostgresUrl(process.env.INTEGRATION_POSTGRES_URL);

  const started = await container(POSTGRES_IMAGE)
    .withEnvironment({ POSTGRES_USER: "infisical", POSTGRES_PASSWORD: "infisical", POSTGRES_DB: "postgres" })
    .withCommand([
      "postgres",
      "-c",
      "max_locks_per_transaction=512",
      "-c",
      "fsync=off",
      "-c",
      "synchronous_commit=off",
      "-c",
      "full_page_writes=off"
    ])
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();

  return {
    host: started.getHost(),
    port: started.getMappedPort(5432),
    user: "infisical",
    password: "infisical",
    maintenanceDatabase: "postgres"
  };
};

const listFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
};

// Named after its migrations, so an unchanged tree reuses it across runs on the same server.
const templateName = async () => {
  const files = await listFiles(MIGRATIONS_DIRECTORY);
  const contents = await Promise.all(files.map((file) => readFile(file)));
  const hash = createHash("sha256");
  files.forEach((file, index) => {
    hash.update(path.relative(MIGRATIONS_DIRECTORY, file));
    hash.update(contents[index]);
  });
  return `${DATABASE_PREFIX}tpl_${hash.digest("hex").slice(0, 16)}`;
};

// startOnce serialises workers in this run; the advisory lock serialises runs sharing a server. Built under
// another name and renamed at the end, so a crash mid-migration never leaves a template that looks done. Stale
// templates are dropped unforced, so one another run is still cloning stays until a later build.
const buildTemplate = async (server: TPostgresServer): Promise<{ name: string }> => {
  const name = await templateName();
  const admin = connectMaintenance(server);

  try {
    await admin.raw("SELECT pg_advisory_lock(?)", [TEMPLATE_LOCK_KEY]);
    if (await databaseExists(admin, name)) return { name };

    const building = `${name}_building`;
    await dropDatabase(admin, building);
    await createDatabase(admin, building);

    const db = connectDatabase(server, building);
    try {
      await db.migrate.latest({
        directory: MIGRATIONS_DIRECTORY,
        extension: "ts",
        loadExtensions: [".ts"],
        tableName: "infisical_migrations"
      });
    } finally {
      await db.destroy();
    }

    await admin.raw("ALTER DATABASE ?? RENAME TO ??", [building, name]);

    const stale = (await listHarnessDatabases(admin, `${DATABASE_PREFIX}tpl_`)).filter((other) => other !== name);
    await Promise.all(stale.map((other) => dropDatabase(admin, other, { force: false }).catch(() => undefined)));

    return { name };
  } finally {
    await admin.raw("SELECT pg_advisory_unlock(?)", [TEMPLATE_LOCK_KEY]).catch(() => undefined);
    await admin.destroy();
  }
};

const startPostgres = async () => {
  const server = await startOnce("postgres-server", startPostgresServer);
  const template = await startOnce("postgres-template", () => buildTemplate(server));
  return { server, template };
};

const open = async (server: TPostgresServer, name: string, close: () => Promise<void>): Promise<TOpenDatabase> => {
  const db = connectDatabase(server, name);
  const { rows } = await db.raw<{ rows: { name: string }[] }>("SELECT current_database() AS name");
  if (rows[0]?.name !== name) {
    await db.destroy();
    throw new Error(
      `Expected to connect to ${name} but reached ${rows[0]?.name}; check for DB_* environment variables`
    );
  }
  return {
    server,
    name,
    db,
    close: async () => {
      await db.destroy();
      await close();
    }
  };
};

const withMaintenance = async <T>(
  server: TPostgresServer,
  work: (admin: ReturnType<typeof connectMaintenance>) => Promise<T>
) => {
  const admin = connectMaintenance(server);
  try {
    return await work(admin);
  } finally {
    await admin.destroy();
  }
};

// One clone per worker, reused by its files since they run one after another.
export const openWorkerDatabase = async (): Promise<TOpenDatabase> => {
  const { server, template } = await startPostgres();
  const name = `${runDatabasePrefix(getRunId())}w${process.env.VITEST_POOL_ID ?? "0"}`;

  await withMaintenance(server, async (admin) => {
    if (!(await databaseExists(admin, name))) await createDatabase(admin, name, template.name);
  });

  return open(server, name, async () => undefined);
};

export const openFreshDatabase = async (): Promise<TOpenDatabase> => {
  const { server, template } = await startPostgres();
  const name = `${runDatabasePrefix(getRunId())}f${randomId(8)}`;

  await withMaintenance(server, (admin) => createDatabase(admin, name, template.name));

  return open(server, name, () => withMaintenance(server, (admin) => dropDatabase(admin, name)));
};

export type TEmptyDatabase = TOpenDatabase & { connectionUri: string };

export const openEmptyDatabase = async (server: TPostgresServer): Promise<TEmptyDatabase> => {
  const name = `${runDatabasePrefix(getRunId())}e${randomId(8)}`;

  await withMaintenance(server, (admin) => createDatabase(admin, name));

  const opened = await open(server, name, () => withMaintenance(server, (admin) => dropDatabase(admin, name)));
  return { ...opened, connectionUri: connectionUri(server, name) };
};
