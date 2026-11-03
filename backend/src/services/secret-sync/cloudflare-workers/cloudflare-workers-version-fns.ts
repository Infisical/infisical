import { isAxiosError } from "axios";

import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto/cryptography";
import { logger } from "@app/lib/logger";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { TSecretMap, TSyncSecretsResult } from "@app/services/secret-sync/secret-sync-types";

import { planSyncBindings, TWrittenBinding } from "./cloudflare-workers-binding-fns";
import { getCloudflareErrors, validateCloudflareResponse } from "./cloudflare-workers-errors";
import { TCloudflareWorkersSyncWithCredentials } from "./cloudflare-workers-types";

// A fallback moves the Worker's whole bundle each way (up to ~85 MB of base64), so only a few run at once. A job
// that finds them all busy is retried instead of waiting, since waiting counts against its lock.
const MAX_CONCURRENT_FALLBACKS = 2;
let activeFallbacks = 0;
// The three requests together stay well inside the sync job's 5-minute lock, so a second job for the same sync can't
// start while one is still uploading.
const VERSION_REQUEST_TIMEOUT_MS = 60 * 1000;
const MAX_VERSION_PAYLOAD_BYTES = 128 * 1024 * 1024;
// Outlives the version requests made under the lock at their longest: read, upload and read back, then the same three
// again to restore the base and a delete if Cloudflare stored something other than what was uploaded.
const WORKER_LOCK_DURATION_MS = 7 * VERSION_REQUEST_TIMEOUT_MS + 60 * 1000;

// Read as the reason in $fail's message, for the errors a copied version can run into.
const CLOUDFLARE_ERROR_REASONS: Record<number, string> = {
  10021: "Cloudflare rejected the Worker code copied from the latest version",
  10068: "Cloudflare rejected the Worker code copied from the latest version",
  10057: "a binding kept from the latest version no longer exists there",
  10027: "the Worker is over Cloudflare's 64 MiB size limit"
};

type TVersionModule = {
  name: string;
  content_type?: string;
  content_base64: string;
};
type TVersionBinding = { type: string; name: string };
type TWorkerVersion = {
  id: string;
  main_module?: string;
  modules?: TVersionModule[];
  bindings?: TVersionBinding[];
} & Record<string, unknown>;

// The sync whose secrets a new version applies. Without one, the new version is an unchanged copy of its base.
type TSecretChanges = { secretSync: TCloudflareWorkersSyncWithCredentials; secretMap: TSecretMap };

type TFallbackContext = {
  syncId: string;
  scriptId: string;
  accountUrl: string;
  headers: Record<string, string>;
};

type TExpectedVersion = {
  baseVersionId: string;
  bindings: string[];
  moduleHashes: Map<string, string>;
};

const $fail = (
  scriptId: string,
  reason: string,
  fix = "Deploy the latest version of the Worker in Cloudflare, then sync again.",
  { error, shouldRetry = false }: { error?: unknown; shouldRetry?: boolean } = {}
) =>
  new SecretSyncError({
    message: `The latest version of Cloudflare Worker '${scriptId}' is not deployed, so Infisical tried to add the secrets to a new version of the Worker instead, but ${reason}. ${fix}`,
    error,
    shouldRetry
  });

// Every failure of a fallback request reaches the user as a $fail message, including timeouts and the payload
// limits, which carry no Cloudflare error body.
const $throwRequestError = (scriptId: string, err: unknown, { canRetry }: { canRetry: boolean }): never => {
  if (!isAxiosError(err)) throw err;

  const cloudflareErrors = getCloudflareErrors(err.response?.data);
  if (cloudflareErrors.length) {
    const known = cloudflareErrors.find(({ code }) => CLOUDFLARE_ERROR_REASONS[code]);
    throw $fail(
      scriptId,
      known
        ? CLOUDFLARE_ERROR_REASONS[known.code]
        : `Cloudflare rejected the request: ${cloudflareErrors.map(({ message }) => message).join(". ")}`,
      undefined,
      { error: err }
    );
  }

  if (err.message.includes("maxContentLength") || err.message.includes("maxBodyLength")) {
    throw $fail(
      scriptId,
      `the Worker is larger than the ${MAX_VERSION_PAYLOAD_BYTES / 1024 / 1024} MiB Infisical can copy`,
      undefined,
      { error: err }
    );
  }

  const isTimeout = err.code === "ECONNABORTED" || err.code === "ETIMEDOUT";
  throw $fail(
    scriptId,
    isTimeout
      ? `the request to Cloudflare took longer than ${VERSION_REQUEST_TIMEOUT_MS / 1000} seconds`
      : "Infisical couldn't reach Cloudflare",
    "Sync again.",
    // A retried upload can't be told apart from a new one, so only reads are retried.
    { error: err, shouldRetry: canRetry }
  );
};

const $bindingLabel = ({ name, type }: { name: string; type: string }) => `${name} (${type})`;

const $hashModule = ({ content_type: contentType, content_base64: contentBase64 }: TVersionModule) =>
  crypto.nativeCrypto
    .createHash("sha256")
    .update(contentType ?? "")
    .update("\0")
    .update(contentBase64)
    .digest("hex");

const $hashModules = (modules: TVersionModule[]) =>
  new Map(modules.map((module) => [module.name, $hashModule(module)]));

// A read that follows an upload isn't retried: the job's retry would upload another version on top of the one
// that was never checked.
const $getVersion = async (
  { scriptId, accountUrl, headers }: TFallbackContext,
  versionRef: string,
  { canRetry = true }: { canRetry?: boolean } = {}
) => {
  try {
    const { data } = await request.get<{ result: TWorkerVersion }>(
      `${accountUrl}/workers/workers/${scriptId}/versions/${versionRef}`,
      {
        headers,
        params: { include: "modules" },
        timeout: VERSION_REQUEST_TIMEOUT_MS,
        maxContentLength: MAX_VERSION_PAYLOAD_BYTES
      }
    );
    return data.result;
  } catch (err) {
    return $throwRequestError(scriptId, err, { canRetry });
  }
};

const $validateBaseVersion = (scriptId: string, base: TWorkerVersion) => {
  if (
    !base.main_module ||
    !base.modules?.length ||
    base.modules.some((module) => typeof module.content_base64 !== "string" || !module.content_base64)
  ) {
    throw $fail(scriptId, `Cloudflare didn't return the code of version ${base.id}`);
  }

  if (!Array.isArray(base.bindings)) {
    throw $fail(scriptId, `Cloudflare didn't return the bindings of version ${base.id}`);
  }

  // A read returns only the assets config, not the upload token, so a copy is created without the static files and
  // serves 404 for them once deployed. Cloudflare accepts it unless the Worker also has an assets binding.
  if ((base.assets !== null && base.assets !== undefined) || base.bindings.some(({ type }) => type === "assets")) {
    throw $fail(scriptId, `version ${base.id} serves static assets, which Infisical can't copy into a new version`);
  }
};

// Kept apart from verification so the base version's modules can be freed before the new version is read back.
const $createVersion = async (
  ctx: TFallbackContext,
  baseVersionRef: string,
  changes: TSecretChanges | undefined,
  { message }: { message: string }
) => {
  const base = await $getVersion(ctx, baseVersionRef);
  $validateBaseVersion(ctx.scriptId, base);

  // Everything else is sent back, so configuration Cloudflare adds later carries over to the new version. A read
  // returns the bindings as both `env` and `bindings`, and Cloudflare rejects an upload with both (10021).
  const { id: baseVersionId, env: omittedEnv, ...config } = base;
  const baseBindings = base.bindings as TVersionBinding[];
  const plan = changes
    ? planSyncBindings(changes.secretSync, changes.secretMap, baseBindings)
    : { written: [], dropped: [] };

  if (changes && !plan.written.length && !plan.dropped.length) return null;

  const writtenByName = new Map(plan.written.map((binding) => [binding.name, binding]));
  const dropped = new Set(plan.dropped);
  const baseNames = new Set(baseBindings.map(({ name }) => name));

  const bindings: Array<TWrittenBinding | { type: "inherit"; name: string; version_id: string }> = [];
  const expectedBindings: string[] = [];

  for (const binding of baseBindings) {
    const written = writtenByName.get(binding.name);
    if (written) {
      bindings.push(written);
      expectedBindings.push($bindingLabel(written));
    } else if (!dropped.has(binding.name)) {
      // Pinned to the base's id, since another upload can replace the latest version while this one is built.
      bindings.push({
        type: "inherit",
        name: binding.name,
        version_id: baseVersionId
      });
      expectedBindings.push($bindingLabel(binding));
    }
  }

  const createdSecretKeys: string[] = [];
  for (const written of plan.written) {
    if (!baseNames.has(written.name)) {
      bindings.push(written);
      expectedBindings.push($bindingLabel(written));
      createdSecretKeys.push(written.name);
    }
  }

  const expected: TExpectedVersion = {
    baseVersionId,
    bindings: expectedBindings.sort(),
    moduleHashes: $hashModules(base.modules as TVersionModule[])
  };

  let newVersionId: string;
  try {
    const { data } = await request.post<{
      result?: { id?: string };
      success?: boolean;
    }>(
      `${ctx.accountUrl}/workers/workers/${ctx.scriptId}/versions`,
      {
        ...config,
        bindings,
        annotations: {
          "workers/tag": "infisical-sync",
          "workers/message": message
        }
      },
      {
        headers: { ...ctx.headers, "Content-Type": "application/json" },
        params: { deploy: false },
        timeout: VERSION_REQUEST_TIMEOUT_MS,
        maxBodyLength: MAX_VERSION_PAYLOAD_BYTES,
        // A retried upload can't be told apart from a new one, and each one becomes the latest version.
        "axios-retry": { retries: 0 }
      }
    );
    validateCloudflareResponse(data);
    if (!data.result?.id) {
      throw $fail(ctx.scriptId, "Cloudflare didn't return the id of the version it created");
    }
    newVersionId = data.result.id;
  } catch (err) {
    if (err instanceof SecretSyncError) throw err;
    return $throwRequestError(ctx.scriptId, err, { canRetry: false });
  }

  logger.info(
    `SecretSync Cloudflare Workers fallback created version [syncId=${ctx.syncId}] [scriptId=${ctx.scriptId}] [baseVersionId=${baseVersionId}] [newVersionId=${newVersionId}] [bindings=${expectedBindings.join(", ")}]`
  );

  return {
    newVersionId,
    expected,
    result: {
      createdSecretKeys,
      updatedSecretKeys: [...writtenByName.keys()].filter((name) => baseNames.has(name)),
      deletedSecretKeys: baseBindings.filter(({ name }) => dropped.has(name)).map(({ name }) => name)
    }
  };
};

// Compares the version Cloudflare stored with what was uploaded: binding names and types, and every module's code.
const $findDifferences = async (ctx: TFallbackContext, newVersionId: string, expected: TExpectedVersion) => {
  const created = await $getVersion(ctx, newVersionId, { canRetry: false });
  const differences: string[] = [];

  const actualBindings = (created.bindings ?? []).map($bindingLabel);
  const missingBindings = expected.bindings.filter((binding) => !actualBindings.includes(binding));
  const unexpectedBindings = actualBindings.filter((binding) => !expected.bindings.includes(binding));
  if (missingBindings.length) differences.push(`missing bindings ${missingBindings.join(", ")}`);
  if (unexpectedBindings.length) differences.push(`unexpected bindings ${unexpectedBindings.join(", ")}`);

  const actualModuleHashes = $hashModules(created.modules ?? []);
  const moduleNames = new Set([...expected.moduleHashes.keys(), ...actualModuleHashes.keys()]);
  const changedModules = [...moduleNames].filter(
    (name) => expected.moduleHashes.get(name) !== actualModuleHashes.get(name)
  );
  if (changedModules.length) differences.push(`different modules ${changedModules.join(", ")}`);

  return differences;
};

const $uploadCheckedVersion = async (
  ctx: TFallbackContext,
  baseVersionRef: string,
  changes: TSecretChanges | undefined,
  options: Parameters<typeof $createVersion>[3]
) => {
  const created = await $createVersion(ctx, baseVersionRef, changes, options);
  if (!created) return null;

  const differences = await $findDifferences(ctx, created.newVersionId, created.expected);
  if (differences.length) {
    logger.error(
      `SecretSync Cloudflare Workers fallback version mismatch [syncId=${ctx.syncId}] [scriptId=${ctx.scriptId}] [baseVersionId=${created.expected.baseVersionId}] [newVersionId=${created.newVersionId}] [differences=${differences.join("; ")}]`
    );
  }

  return { ...created, differences };
};

const $deleteVersion = async ({ scriptId, accountUrl, headers }: TFallbackContext, versionId: string) => {
  try {
    const { data } = await request.delete<{ success?: boolean }>(
      `${accountUrl}/workers/workers/${scriptId}/versions/${versionId}`,
      { headers }
    );
    validateCloudflareResponse(data);
  } catch (err) {
    if (err instanceof SecretSyncError) throw err;
    $throwRequestError(scriptId, err, { canRetry: false });
  }
};

// A rejected version is the latest, so the next sync would build on it, and Cloudflare refuses to delete the latest
// version. An unchanged copy of the base takes its place first, after which the rejected version can be deleted.
// Nothing here is thrown: a failure must not reach the job's retry, which would build on the rejected version.
const $replaceRejectedVersion = async (
  ctx: TFallbackContext,
  rejectedVersionId: string,
  baseVersionId: string
): Promise<{ replaced: true; deleted: boolean } | { replaced: false; unsafeVersionIds: string[] }> => {
  const unsafeVersionIds = [rejectedVersionId];

  try {
    const restored = await $createVersion(ctx, baseVersionId, undefined, {
      message: `Infisical secret sync (restores ${baseVersionId} in place of rejected ${rejectedVersionId})`
    });
    if (!restored) return { replaced: false, unsafeVersionIds };

    unsafeVersionIds.push(restored.newVersionId);
    const differences = await $findDifferences(ctx, restored.newVersionId, restored.expected);
    if (differences.length) {
      logger.error(
        `SecretSync Cloudflare Workers restored version mismatch [syncId=${ctx.syncId}] [scriptId=${ctx.scriptId}] [baseVersionId=${baseVersionId}] [newVersionId=${restored.newVersionId}] [differences=${differences.join("; ")}]`
      );
      return { replaced: false, unsafeVersionIds };
    }
  } catch (err) {
    logger.error(
      err,
      `SecretSync Cloudflare Workers failed to restore version [syncId=${ctx.syncId}] [scriptId=${ctx.scriptId}] [baseVersionId=${baseVersionId}] [rejectedVersionId=${rejectedVersionId}]`
    );
    return { replaced: false, unsafeVersionIds };
  }

  try {
    await $deleteVersion(ctx, rejectedVersionId);
    return { replaced: true, deleted: true };
  } catch (err) {
    logger.warn(
      err,
      `SecretSync Cloudflare Workers failed to delete rejected version [syncId=${ctx.syncId}] [scriptId=${ctx.scriptId}] [versionId=${rejectedVersionId}]`
    );
    return { replaced: true, deleted: false };
  }
};

// The secrets and settings endpoints refuse to write while the latest version is not the deployed one. This builds
// a new version from the latest one's code and bindings with the secrets changed, uploads it without deploying it,
// and checks it. Deploying it is left to the user, because it also ships the pending changes it was built on.
const $applySecretsWithVersionFallback = async (
  secretSync: TCloudflareWorkersSyncWithCredentials,
  secretMap: TSecretMap,
  keyStore: Pick<TKeyStoreFactory, "acquireLock">
): Promise<TSyncSecretsResult | undefined> => {
  const {
    id: syncId,
    connection: {
      credentials: { apiToken, accountId }
    },
    destinationConfig: { scriptId }
  } = secretSync;

  const ctx: TFallbackContext = {
    syncId,
    scriptId,
    accountUrl: `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}`,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json"
    }
  };

  logger.info(
    `SecretSync Cloudflare Workers latest version not deployed, using fallback [syncId=${syncId}] [scriptId=${scriptId}]`
  );

  // Each sync builds on the latest version, so two syncs to one Worker reading it at once would each upload a
  // copy missing the other's changes. The lock is per Worker because syncs only lock themselves.
  let lock: Awaited<ReturnType<typeof keyStore.acquireLock>>;
  try {
    lock = await keyStore.acquireLock(
      [KeyStorePrefixes.CloudflareWorkerVersionLock(accountId, scriptId)],
      WORKER_LOCK_DURATION_MS
    );
  } catch {
    throw $fail(
      scriptId,
      "another sync was adding secrets to a new version of the same Worker",
      "Infisical retries the sync automatically. If it keeps failing, sync again later.",
      { shouldRetry: true }
    );
  }

  try {
    const created = await $uploadCheckedVersion(
      ctx,
      "latest",
      { secretSync, secretMap },
      {
        message: "Infisical secret sync"
      }
    );
    if (!created) return undefined;

    if (created.differences.length) {
      const {
        newVersionId,
        expected: { baseVersionId }
      } = created;
      const outcome = await $replaceRejectedVersion(ctx, newVersionId, baseVersionId);
      const reason = `Cloudflare stored the new version differently from what Infisical uploaded (${created.differences.join("; ")})`;

      if (!outcome.replaced) {
        throw $fail(
          scriptId,
          reason,
          `Infisical couldn't put an unchanged copy of version ${baseVersionId} in its place, so don't deploy version ${outcome.unsafeVersionIds.join(" or ")}. The next sync builds on the latest version, so upload a new version of the Worker before syncing again, and contact support.`
        );
      }

      throw $fail(
        scriptId,
        reason,
        outcome.deleted
          ? `Infisical deleted that version and made an unchanged copy of version ${baseVersionId} the latest. Sync again, and contact support if this keeps happening.`
          : `Infisical made an unchanged copy of version ${baseVersionId} the latest, but couldn't delete the rejected version ${newVersionId}. Don't deploy it. Sync again, and contact support if this keeps happening.`
      );
    }

    return {
      ...created.result,
      message: `Worker has undeployed changes; created version ${created.newVersionId} with updated secrets. Deploy it for the secrets to take effect.`
    };
  } finally {
    // A release that fails (the lock already expired) mustn't turn a finished sync into a failed one.
    await lock.release().catch((err: unknown) => {
      logger.warn(
        err,
        `SecretSync Cloudflare Workers failed to release Worker lock [syncId=${syncId}] [scriptId=${scriptId}]`
      );
    });
  }
};

export const applySecretsWithVersionFallback = async (
  secretSync: TCloudflareWorkersSyncWithCredentials,
  secretMap: TSecretMap,
  keyStore: Pick<TKeyStoreFactory, "acquireLock">
) => {
  if (activeFallbacks >= MAX_CONCURRENT_FALLBACKS) {
    throw $fail(
      secretSync.destinationConfig.scriptId,
      "Infisical was already building as many Worker versions as it builds at once",
      "Infisical retries the sync automatically. If it keeps failing, sync again later.",
      { shouldRetry: true }
    );
  }

  activeFallbacks += 1;
  try {
    return await $applySecretsWithVersionFallback(secretSync, secretMap, keyStore);
  } finally {
    activeFallbacks -= 1;
  }
};
