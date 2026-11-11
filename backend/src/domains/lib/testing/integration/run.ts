import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { customAlphabet } from "nanoid";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";

// No vitest runtime imports: global-setup.ts imports this from Vitest's main process.

export const RUN_LABEL = "com.infisical.integration-test.run";

// The harness only creates or drops databases with this prefix.
export const DATABASE_PREFIX = "infisical_it_";

// Lowercase letters and digits, starting with a letter, so it works unquoted as a DB name, Unix user or LDAP RDN.
const firstChar = customAlphabet("abcdefghijklmnopqrstuvwxyz", 1);
const restChars = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 32);

export const randomId = (length = 10) => `${firstChar()}${restChars(length - 1)}`;

export const runDirectory = (runId: string) => path.join(os.tmpdir(), "infisical-integration", runId);

export const createRunDirectory = (runId: string) => mkdir(runDirectory(runId), { recursive: true });

const addressFile = (runId: string, name: string) => path.join(runDirectory(runId), `${name}.json`);

export const readAddress = async <T>(runId: string, name: string): Promise<T | undefined> => {
  try {
    const contents = await readFile(addressFile(runId, name), "utf8");
    return JSON.parse(contents) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
};

// Temp file + rename so readers never see a half-written address.
export const writeAddress = async (runId: string, name: string, address: unknown) => {
  const target = addressFile(runId, name);
  const temporary = `${target}.${randomId(6)}.tmp`;
  await writeFile(temporary, JSON.stringify(address));
  await rename(temporary, target);
};

const containersMarker = (runId: string) => path.join(runDirectory(runId), "containers-used");

// Lets teardown skip Docker on runs that never asked for a container.
export const markContainersUsed = (runId: string) => writeFileSync(containersMarker(runId), "");

export const usedContainers = (runId: string) =>
  access(containersMarker(runId)).then(
    () => true,
    () => false
  );
