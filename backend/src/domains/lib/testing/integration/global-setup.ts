import { rm } from "node:fs/promises";
import { getContainerRuntimeClient } from "testcontainers";
import type { TestProject } from "vitest/node";

import { connectMaintenance, dropDatabase, listHarnessDatabases, TPostgresServer } from "./postgres-connection";
import {
  createRunDirectory,
  randomId,
  readAddress,
  RUN_LABEL,
  runDatabasePrefix,
  runDirectory,
  usedContainers
} from "./run";

const dropRunDatabases = async (runId: string) => {
  const server = await readAddress<TPostgresServer>(runId, "postgres-server");
  if (!server) return;

  const admin = connectMaintenance(server);
  try {
    const names = await listHarnessDatabases(admin, runDatabasePrefix(runId));
    await Promise.all(names.map((name) => dropDatabase(admin, name)));
  } finally {
    await admin.destroy();
  }
};

const removeRunContainers = async (runId: string) => {
  const client = await getContainerRuntimeClient();
  const containers = await client.container.dockerode.listContainers({
    all: true,
    filters: { label: [`${RUN_LABEL}=${runId}`] }
  });
  await Promise.all(containers.map((info) => client.container.getById(info.Id).remove({ force: true, v: true })));
};

// Runs once in Vitest's main process and starts nothing: servers start lazily via startOnce. Teardown drops
// DBs only on an external server, since containers take theirs with them.
export default async function setup(project: TestProject) {
  const runId = `${Date.now().toString(36)}${randomId(4)}`;
  await createRunDirectory(runId);
  project.provide("integrationRunId", runId);

  return async () => {
    if (process.env.INTEGRATION_POSTGRES_URL) await dropRunDatabases(runId);
    if (await usedContainers(runId)) await removeRunContainers(runId);
    await rm(runDirectory(runId), { recursive: true, force: true });
  };
}
