import { AxiosError } from "axios";

import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";

// The script secrets (10215) and settings (10214) endpoints clone the latest uploaded version, and refuse when
// it isn't the deployed one.
const CLOUDFLARE_PENDING_VERSION_ERROR_CODES = new Set([10214, 10215]);

export type TCloudflareApiResponse = {
  result?: unknown;
  success?: boolean;
  errors?: Array<{ code: number; message: string }>;
  messages?: string[];
};

export class CloudflareWorkersPendingVersionError extends SecretSyncError {}

export const getCloudflareErrors = (data: unknown): Array<{ code: number; message: string }> => {
  if (typeof data !== "object" || data === null) return [];
  const { errors } = data as TCloudflareApiResponse;
  if (!Array.isArray(errors)) return [];
  return errors.filter((error) => typeof error?.message === "string");
};

const $throwCloudflareError = (
  errors: Array<{ code: number; message: string }>,
  cause: unknown,
  secretKey?: string
): never => {
  if (errors.some((e) => CLOUDFLARE_PENDING_VERSION_ERROR_CODES.has(e.code))) {
    throw new CloudflareWorkersPendingVersionError({
      message:
        "Cloudflare rejected the secret update because the latest Worker version is not deployed; deploy the latest Worker version, then retry the secret sync.",
      error: cause,
      secretKey,
      shouldRetry: false
    });
  }

  throw new SecretSyncError({
    message: errors.map((e) => e.message).join(". "),
    error: cause,
    secretKey,
    shouldRetry: false
  });
};

export const throwOnCloudflareRequestError = (err: unknown, secretKey?: string): never => {
  if (err instanceof AxiosError) {
    const errors = getCloudflareErrors(err.response?.data);
    if (errors.length > 0) {
      $throwCloudflareError(errors, err, secretKey);
    }
  }

  throw err;
};

export const validateCloudflareResponse = (data: unknown) => {
  if (typeof data !== "object" || data === null) return;
  if ((data as TCloudflareApiResponse).success === false) {
    const errors = getCloudflareErrors(data);
    if (errors.length > 0) {
      $throwCloudflareError(errors, undefined);
    }
    throw new SecretSyncError({
      message: "Cloudflare returned an unsuccessful response without error details.",
      shouldRetry: false
    });
  }
};
