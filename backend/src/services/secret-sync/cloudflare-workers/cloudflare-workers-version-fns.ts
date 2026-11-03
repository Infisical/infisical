import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { TSecretMap, TSyncSecretsResult } from "@app/services/secret-sync/secret-sync-types";

import { planSyncBindings, TBindingPlan } from "./cloudflare-workers-binding-fns";
import { throwOnCloudflareRequestError, validateCloudflareResponse } from "./cloudflare-workers-errors";
import { TCloudflareWorkersSyncWithCredentials } from "./cloudflare-workers-types";

const REQUEST_TIMEOUT_MS = 30 * 1000;
// Outlives the three requests made under the lock at their longest.
const WORKER_LOCK_DURATION_MS = 3 * REQUEST_TIMEOUT_MS + 60 * 1000;

type TVersionBinding = { type: string; name: string };
type TWorkerVersion = { id: string; bindings?: TVersionBinding[] };

type TFallbackContext = {
  scriptId: string;
  accountUrl: string;
  headers: Record<string, string>;
};

const $getVersion = async (ctx: TFallbackContext, versionRef: string) => {
  try {
    const { data } = await request.get<{ result: TWorkerVersion }>(
      `${ctx.accountUrl}/workers/workers/${ctx.scriptId}/versions/${versionRef}`,
      { headers: ctx.headers, timeout: REQUEST_TIMEOUT_MS }
    );
    return data.result;
  } catch (err) {
    return throwOnCloudflareRequestError(err);
  }
};

// Cloudflare copies the latest version, code and all, and merges `env` into its bindings by name: an entry creates or
// replaces that binding, and null deletes it. The new version isn't deployed.
const $patchLatestVersion = async (ctx: TFallbackContext, env: Record<string, unknown>) => {
  try {
    const { data } = await request.patch<{ result?: TWorkerVersion; success?: boolean }>(
      `${ctx.accountUrl}/workers/workers/${ctx.scriptId}/versions/latest`,
      {
        env,
        annotations: { "workers/message": "Infisical secret sync", "workers/tag": "infisical-sync" }
      },
      {
        headers: { ...ctx.headers, "Content-Type": "application/merge-patch+json" },
        timeout: REQUEST_TIMEOUT_MS,
        // A retry would create a second version on top of the first.
        "axios-retry": { retries: 0 }
      }
    );
    validateCloudflareResponse(data);
    if (!data.result?.id) {
      throw new SecretSyncError({
        message: `Cloudflare didn't return the version it created for Worker '${ctx.scriptId}'. Sync again.`,
        shouldRetry: false
      });
    }
    return data.result;
  } catch (err) {
    if (err instanceof SecretSyncError) throw err;
    return throwOnCloudflareRequestError(err);
  }
};

const $bindingLabel = ({ name, type }: TVersionBinding) => `${name} (${type})`;

// Compares the bindings Cloudflare stored, by name and type, with the latest version's after the patch.
const $findDifferences = async (
  ctx: TFallbackContext,
  versionId: string,
  baseBindings: TVersionBinding[],
  plan: TBindingPlan
) => {
  const writtenNames = new Set(plan.written.map(({ name }) => name));
  const dropped = new Set(plan.dropped);
  const expected = [
    ...baseBindings.filter(({ name }) => !writtenNames.has(name) && !dropped.has(name)),
    ...plan.written
  ].map($bindingLabel);

  const actual = ((await $getVersion(ctx, versionId)).bindings ?? []).map($bindingLabel);

  const missing = expected.filter((label) => !actual.includes(label));
  const unexpected = actual.filter((label) => !expected.includes(label));
  return [
    ...(missing.length ? [`missing ${missing.join(", ")}`] : []),
    ...(unexpected.length ? [`unexpected ${unexpected.join(", ")}`] : [])
  ];
};

const $applySecrets = async (
  secretSync: TCloudflareWorkersSyncWithCredentials,
  secretMap: TSecretMap,
  ctx: TFallbackContext
): Promise<TSyncSecretsResult | undefined> => {
  const latest = await $getVersion(ctx, "latest");
  const baseBindings = latest.bindings ?? [];

  const plan = planSyncBindings(secretSync, secretMap, baseBindings);
  if (!plan.written.length && !plan.dropped.length) return undefined;

  // Null-prototype object so secret names like "__proto__" are sent as regular keys.
  const env = Object.create(null) as Record<string, unknown>;
  for (const { name, ...binding } of plan.written) env[name] = binding;
  for (const name of plan.dropped) env[name] = null;

  const created = await $patchLatestVersion(ctx, env);
  logger.info(
    `SecretSync Cloudflare Workers created version [scriptId=${ctx.scriptId}] [baseVersionId=${latest.id}] [newVersionId=${created.id}]`
  );

  const differences = await $findDifferences(ctx, created.id, baseBindings, plan);
  if (differences.length) {
    throw new SecretSyncError({
      message: `Cloudflare stored version ${created.id} of Worker '${ctx.scriptId}' with different bindings than Infisical sent (${differences.join("; ")}). Don't deploy it. Sync again, and contact support if this keeps happening.`,
      shouldRetry: false
    });
  }

  const baseNames = new Set(baseBindings.map(({ name }) => name));
  return {
    createdSecretKeys: plan.written.filter(({ name }) => !baseNames.has(name)).map(({ name }) => name),
    updatedSecretKeys: plan.written.filter(({ name }) => baseNames.has(name)).map(({ name }) => name),
    deletedSecretKeys: plan.dropped,
    message: `Worker has undeployed changes; created version ${created.id} with updated secrets. Deploy it for the secrets to take effect.`
  };
};

// The secrets and settings endpoints refuse to write while the latest version is not the deployed one. This has
// Cloudflare build a new version from the latest one with the secrets changed, and leaves deploying it to the user,
// because it also ships the pending changes it was built on.
export const applySecretsWithVersionFallback = async (
  secretSync: TCloudflareWorkersSyncWithCredentials,
  secretMap: TSecretMap,
  keyStore: Pick<TKeyStoreFactory, "acquireLock">
) => {
  const {
    id: syncId,
    connection: {
      credentials: { apiToken, accountId }
    },
    destinationConfig: { scriptId }
  } = secretSync;

  const ctx: TFallbackContext = {
    scriptId,
    accountUrl: `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}`,
    headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" }
  };

  logger.info(
    `SecretSync Cloudflare Workers latest version not deployed, using fallback [syncId=${syncId}] [scriptId=${scriptId}]`
  );

  // Each fallback plans its deletions from the latest version, so two syncs to one Worker patching at once would
  // each see the other's change as unexpected. The lock is per Worker because syncs only lock themselves.
  let lock: Awaited<ReturnType<typeof keyStore.acquireLock>>;
  try {
    lock = await keyStore.acquireLock(
      [KeyStorePrefixes.CloudflareWorkerVersionLock(accountId, scriptId)],
      WORKER_LOCK_DURATION_MS
    );
  } catch {
    throw new SecretSyncError({
      message: `Another sync was adding secrets to a new version of Cloudflare Worker '${scriptId}' at the same time. Infisical retries the sync automatically. If it keeps failing, sync again later.`,
      shouldRetry: true
    });
  }

  try {
    return await $applySecrets(secretSync, secretMap, ctx);
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
