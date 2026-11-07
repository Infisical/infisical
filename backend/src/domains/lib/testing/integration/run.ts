import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { customAlphabet } from "nanoid";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";

// No vitest runtime imports here: global-setup.ts runs in Vitest's main process and imports this file.

export const RUN_LABEL = "com.infisical.integration-test.run";

// Every database the harness creates starts with this, and the harness refuses to create or drop any other.
export const DATABASE_PREFIX = "infisical_it_";

// Lowercase letters and digits only, starting with a letter, so the result is valid as a database name,
// a Unix username or an LDAP RDN without quoting.
const firstChar = customAlphabet("abcdefghijklmnopqrstuvwxyz", 1);
const restChars = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 32);

export const randomId = (length = 10) => `${firstChar()}${restChars(length - 1)}`;

export const runDirectory = (runId: string) => path.join(os.tmpdir(), "infisical-integration", runId);

export const createRunDirectory = (runId: string) => mkdir(runDirectory(runId), { recursive: true });

const addressFile = (runId: string, name: string) => path.join(runDirectory(runId), `${name}.json`);

export const readAddress = async <T>(runId: string, name: string): Promise<T | undefined> => {
  try {
    return JSON.parse(await readFile(addressFile(runId, name), "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
};

// Written to a temporary file and renamed, so a reader never sees a half-written address.
export const writeAddress = async (runId: string, name: string, address: unknown) => {
  const target = addressFile(runId, name);
  const temporary = `${target}.${randomId(6)}.tmp`;
  await writeFile(temporary, JSON.stringify(address));
  await rename(temporary, target);
};

const containersMarker = (runId: string) => path.join(runDirectory(runId), "containers-used");

// Lets global teardown skip Docker entirely on a run that never asked for a container.
export const markContainersUsed = (runId: string) => writeFileSync(containersMarker(runId), "");

export const usedContainers = (runId: string) =>
  access(containersMarker(runId)).then(
    () => true,
    () => false
  );
