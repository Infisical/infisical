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

// Shorter than the config's hookTimeout, so a lock left by a crashed worker fails with the message below
// rather than a bare hook timeout.
const LOCK_TIMEOUT_MS = 4 * 60 * 1000;
const LOCK_POLL_MS = 200;

export const getRunId = () => inject("integrationRunId");

// mkdir is atomic across processes: one caller creates the dir, the rest get EEXIST and wait.
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

// Once per run across all workers. If start throws, the next caller retries. The address crosses
// processes, so plain JSON only, never a live client.
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

// Other workers may still use it after this one exits, so global teardown removes it by label instead.
export const container = (image: string) => {
  const runId = getRunId();
  // Recorded before the container exists, so teardown still runs if a start fails halfway.
  markContainersUsed(runId);
  return new GenericContainer(image).withLabels({ [RUN_LABEL]: runId });
};
