import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { planRemovedBindings, planSyncBindings, toEnvPatch } from "./cloudflare-workers-binding-fns";
import {
  getCloudflareErrors,
  throwOnCloudflareRequestError,
  validateCloudflareResponse
} from "./cloudflare-workers-errors";
import { TCloudflareWorkersSyncWithCredentials } from "./cloudflare-workers-types";

const REQUEST_TIMEOUT_MS = 30 * 1000;

// Cloudflare doesn't document the Previews API; these are the codes wrangler handles. A Preview without a
// deployment is 10222 on reads and 10032 on writes.
const PREVIEW_NOT_FOUND_ERROR_CODE = 10025;
const NO_PREVIEW_DEPLOYMENT_ERROR_CODES = new Set([10032, 10222]);

type TPreviewDeployment = { id: string; env?: Record<string, { type: string }> };

type TPreviewContext = {
  scriptId: string;
  previewName: string;
  deploymentUrl: string;
  headers: Record<string, string>;
};

const $throwPreviewRequestError = (ctx: TPreviewContext, err: unknown): never => {
  if (err instanceof AxiosError) {
    const codes = getCloudflareErrors(err.response?.data).map(({ code }) => code);

    if (codes.includes(PREVIEW_NOT_FOUND_ERROR_CODE)) {
      throw new SecretSyncError({
        message: `Cloudflare Worker '${ctx.scriptId}' has no Preview named '${ctx.previewName}'. Check the Preview name, or create the Preview with wrangler preview.`,
        error: err,
        shouldRetry: false
      });
    }

    if (codes.some((code) => NO_PREVIEW_DEPLOYMENT_ERROR_CODES.has(code))) {
      throw new SecretSyncError({
        message: `Preview '${ctx.previewName}' on Cloudflare Worker '${ctx.scriptId}' has no deployment yet. Deploy it with wrangler preview, then sync again.`,
        error: err,
        shouldRetry: false
      });
    }
  }

  return throwOnCloudflareRequestError(err);
};

const $getBindings = async (ctx: TPreviewContext) => {
  try {
    const { data } = await request.get<{ result: TPreviewDeployment }>(ctx.deploymentUrl, {
      headers: ctx.headers,
      timeout: REQUEST_TIMEOUT_MS
    });
    return Object.entries(data.result.env ?? {}).map(([name, { type }]) => ({ name, type }));
  } catch (err) {
    return $throwPreviewRequestError(ctx, err);
  }
};

// Cloudflare copies the Preview's latest deployment, merges `env` into its bindings, and serves the Preview from
// the new deployment straight away.
const $patchBindings = async (ctx: TPreviewContext, env: Record<string, unknown>) => {
  try {
    const { data } = await request.patch<{ result?: TPreviewDeployment; success?: boolean }>(
      ctx.deploymentUrl,
      {
        env,
        annotations: { "workers/message": "Infisical secret sync", "workers/tag": "infisical-sync" }
      },
      {
        headers: { ...ctx.headers, "Content-Type": "application/merge-patch+json" },
        timeout: REQUEST_TIMEOUT_MS,
        // A retry would create a second deployment on top of the first.
        "axios-retry": { retries: 0 }
      }
    );
    validateCloudflareResponse(data);
    logger.info(
      `SecretSync Cloudflare Workers created Preview deployment [scriptId=${ctx.scriptId}] [previewName=${ctx.previewName}] [deploymentId=${data.result?.id}]`
    );
  } catch (err) {
    if (err instanceof SecretSyncError) throw err;
    $throwPreviewRequestError(ctx, err);
  }
};

const $getContext = (secretSync: TCloudflareWorkersSyncWithCredentials, previewName: string): TPreviewContext => {
  const {
    connection: {
      credentials: { apiToken, accountId }
    },
    destinationConfig: { scriptId }
  } = secretSync;

  return {
    scriptId,
    previewName,
    deploymentUrl: `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/workers/${scriptId}/previews/${encodeURIComponent(previewName)}/deployments/latest`,
    headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" }
  };
};

export const syncPreviewSecrets = async (
  secretSync: TCloudflareWorkersSyncWithCredentials,
  previewName: string,
  secretMap: TSecretMap
) => {
  const ctx = $getContext(secretSync, previewName);

  const plan = planSyncBindings(secretSync, secretMap, await $getBindings(ctx));
  if (!plan.written.length && !plan.dropped.length) return;

  await $patchBindings(ctx, toEnvPatch(plan));
};

export const removePreviewSecrets = async (
  secretSync: TCloudflareWorkersSyncWithCredentials,
  previewName: string,
  secretMap: TSecretMap
) => {
  const ctx = $getContext(secretSync, previewName);

  const dropped = planRemovedBindings(secretSync, secretMap, await $getBindings(ctx));
  if (!dropped.length) return;

  await $patchBindings(ctx, toEnvPatch({ written: [], dropped }));
};
