import pLimit from "p-limit";

import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto/cryptography";
import { logger } from "@app/lib/logger";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { TSyncSecretsResult } from "@app/services/secret-sync/secret-sync-types";

import { throwOnCloudflareRequestError, validateCloudflareResponse } from "./cloudflare-workers-errors";
import { TCloudflareWorkersSyncWithCredentials } from "./cloudflare-workers-types";

// A fallback moves the Worker's whole bundle each way (up to ~85 MB of base64), so only a few run at once.
const fallbackLimit = pLimit(2);
const VERSION_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_VERSION_PAYLOAD_BYTES = 128 * 1024 * 1024;

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

export type TWrittenBinding = {
  type: string;
  name: string;
  text?: string;
  json?: unknown;
};

// Every base binding that is neither written nor dropped is inherited from the base version unchanged.
export type TBindingPlan = { written: TWrittenBinding[]; dropped: string[] };

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
  fix = "Deploy the latest version of the Worker in Cloudflare, then sync again."
) =>
  new SecretSyncError({
    message: `The latest version of Cloudflare Worker '${scriptId}' is not deployed, so Infisical tried to add the secrets to a new version of the Worker instead, but ${reason}. ${fix}`,
    shouldRetry: false
  });

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

const $getVersion = async ({ scriptId, accountUrl, headers }: TFallbackContext, versionRef: string) => {
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
    return throwOnCloudflareRequestError(err);
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
  planBindings: (baseBindings: TVersionBinding[]) => TBindingPlan
) => {
  const base = await $getVersion(ctx, baseVersionRef);
  $validateBaseVersion(ctx.scriptId, base);

  // Everything else is sent back, so configuration Cloudflare adds later carries over to the new version. A read
  // returns the bindings as both `env` and `bindings`, and Cloudflare rejects an upload with both (10021).
  const { id: baseVersionId, env: omittedEnv, ...config } = base;
  const baseBindings = base.bindings as TVersionBinding[];
  const plan = planBindings(baseBindings);

  if (!plan.written.length && !plan.dropped.length) return null;

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
          "workers/message": `Infisical secret sync (fallback, base ${baseVersionId})`
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
    return throwOnCloudflareRequestError(err);
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

const $verifyVersion = async (ctx: TFallbackContext, newVersionId: string, expected: TExpectedVersion) => {
  const created = await $getVersion(ctx, newVersionId);
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

  if (differences.length) {
    logger.error(
      `SecretSync Cloudflare Workers fallback version mismatch [syncId=${ctx.syncId}] [scriptId=${ctx.scriptId}] [baseVersionId=${expected.baseVersionId}] [newVersionId=${newVersionId}] [differences=${differences.join("; ")}]`
    );
    throw $fail(
      ctx.scriptId,
      `the version it created (${newVersionId}, tagged infisical-sync) doesn't match version ${expected.baseVersionId}: ${differences.join("; ")}`,
      "Don't deploy it. Sync again, and contact support if this keeps happening."
    );
  }
};

// The secrets and settings endpoints refuse to write while the latest version is not the deployed one. This builds
// a new version from the latest one's code and bindings with the secrets changed, uploads it without deploying it,
// and checks it. Deploying it is left to the user, because it also ships the pending changes it was built on.
export const applyBindingsWithVersionFallback = (
  secretSync: TCloudflareWorkersSyncWithCredentials,
  planBindings: (baseBindings: TVersionBinding[]) => TBindingPlan
) =>
  fallbackLimit(async (): Promise<TSyncSecretsResult | undefined> => {
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

    const created = await $createVersion(ctx, "latest", planBindings);
    if (!created) return undefined;

    await $verifyVersion(ctx, created.newVersionId, created.expected);
    return {
      ...created.result,
      message: `Worker has undeployed changes; created version ${created.newVersionId} with updated secrets. Deploy it for the secrets to take effect.`
    };
  });
