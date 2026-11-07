import { rm } from "node:fs/promises";
import { getContainerRuntimeClient } from "testcontainers";
import type { TestProject } from "vitest/node";

import { connectMaintenance, dropDatabase, listHarnessDatabases, TPostgresServer } from "./postgres-connection";
import {
  createRunDirectory,
  DATABASE_PREFIX,
  randomId,
  readAddress,
  RUN_LABEL,
  runDirectory,
  usedContainers
} from "./run";

// Runs in Vitest's main process, once per run. Nothing is started here: servers start on first use
// (startOnce), so a run that needs no SSH server never starts one.

const dropRunDatabases = async (runId: string) => {
  const server = await readAddress<TPostgresServer>(runId, "postgres-server");
  if (!server) return;

  const admin = connectMaintenance(server);
  try {
    const names = await listHarnessDatabases(admin, `${DATABASE_PREFIX}${runId}_`);
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

export default async function setup(project: TestProject) {
  const runId = `${Date.now().toString(36)}${randomId(4)}`;
  await createRunDirectory(runId);
  project.provide("integrationRunId", runId);

  return async () => {
    // A container server is removed whole with its container; only an external server keeps
    // databases that need dropping.
    if (process.env.INTEGRATION_POSTGRES_URL) await dropRunDatabases(runId);
    if (await usedContainers(runId)) await removeRunContainers(runId);
    await rm(runDirectory(runId), { recursive: true, force: true });
  };
}
