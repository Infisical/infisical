import path from "node:path";

import { mkdir, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { GenericContainer } from "testcontainers";
import { inject } from "vitest";

import { markContainersUsed, RUN_LABEL, readAddress, runDirectory, writeAddress } from "./run";

declare module "vitest" {
  export interface ProvidedContext {
    integrationRunId: string;
  }
}

const LOCK_TIMEOUT_MS = 10 * 60 * 1000;
const LOCK_POLL_MS = 200;

export const getRunId = () => inject("integrationRunId");

// mkdir is atomic across processes: exactly one caller creates the directory, the rest get EEXIST and wait.
const withLock = async <T>(name: string, work: () => Promise<T>): Promise<T> => {
  const lockDirectory = path.join(runDirectory(getRunId()), `${name}.lock`);
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  const acquire = async (): Promise<void> => {
    try {
      await mkdir(lockDirectory);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      if (Date.now() > deadline) {
        throw new Error(
          `Timed out after ${LOCK_TIMEOUT_MS / 1000}s waiting for "${name}" to start in another worker. ` +
            `That worker may have crashed while starting it; its lock is ${lockDirectory}.`
        );
      }
      await delay(LOCK_POLL_MS);
      return acquire();
    }
  };

  await acquire();

  try {
    return await work();
  } finally {
    await rm(lockDirectory, { recursive: true, force: true });
  }
};

/**
 * Starts something once for the whole test run, however many workers ask for it.
 *
 * The first caller runs `start` and records the address it returns. Every other caller, in this
 * worker or another, waits for that and gets the same address. If `start` throws, nothing is
 * recorded and the next caller tries again.
 *
 * The address crosses process boundaries, so it must be plain JSON: hosts, ports, names,
 * credentials. Never a live client.
 */
export const startOnce = async <T>(name: string, start: () => Promise<T>): Promise<T> => {
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error(`startOnce name "${name}" must be lowercase letters, digits and dashes`);
  }

  return withLock(name, async () => {
    const runId = getRunId();
    const existing = await readAddress<T>(runId, name);
    if (existing !== undefined) return existing;

    const address = await start();
    await writeAddress(runId, name, address);
    return JSON.parse(JSON.stringify(address)) as T;
  });
};

/**
 * A Testcontainers container that belongs to this test run.
 *
 * The worker that starts a container may exit while other workers still use it, so these
 * containers are not tied to the worker's process. Global teardown removes every container
 * carrying this run's label instead.
 */
export const container = (image: string) => {
  const runId = getRunId();
  // Recorded before the container exists, so teardown still runs if a start fails halfway.
  markContainersUsed(runId);
  return new GenericContainer(image).withLabels({ [RUN_LABEL]: runId });
};
