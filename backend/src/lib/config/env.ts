import fs from "fs";

import { z } from "zod";

import { THsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { crypto } from "@app/lib/crypto/cryptography";
import { QueueWorkerProfile } from "@app/lib/types";
import { TKmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { TSuperAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { BadRequestError } from "../errors";
import { removeTrailingSlash } from "../fn";
import { CustomLogger } from "../logger/logger";
import { zpStr } from "../zod";

/**
 * Resolve Docker Compose / Swarm _FILE-suffixed env vars.
 * For every env var that ends with _FILE, read the file it points to and
 * set the base env var (without the suffix) to the file contents — unless
 * the base var is already explicitly set.
 * Example: ENCRYPTION_KEY_FILE=/run/secrets/enc_key → ENCRYPTION_KEY=<file contents>
 */
function resolveDockerSecrets() {
  for (const [key, filePath] of Object.entries(process.env)) {
    if (!key.endsWith("_FILE") || !filePath) continue;
    const baseKey = key.slice(0, -5);
    if (process.env[baseKey]) continue;
    try {
      process.env[baseKey] = fs.readFileSync(filePath, "utf8").trim();
    } catch {
      // Intentionally silent — downstream Zod schema will report missing required variable
    }
  }
}
resolveDockerSecrets();

export const GITLAB_URL = "https://gitlab.com";

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any -- If `process.pkg` is set, and it's true, then it means that the app is currently running in a packaged environment (a binary)
export const IS_PACKAGED = (process as any)?.pkg !== undefined;