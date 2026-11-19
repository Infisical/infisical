import { TS3Credentials } from "@app/lib/aws/s3";
import { getConfig } from "@app/lib/config/env";

export type TDefaultStorage = {
  bucket: string;
  region: string;
  prefix: string | null;
  credentials?: TS3Credentials;
};

// The instance's own bucket, or null when the operator hasn't set one. Read on every call rather than once, and
// every reader goes through this one module, so "is there default storage" has a single answer.
export const getDefaultStorage = (): TDefaultStorage | null => {
  const cfg = getConfig();
  if (!cfg.OBJECT_STORAGE_S3_BUCKET || !cfg.OBJECT_STORAGE_S3_REGION) return null;
  return {
    bucket: cfg.OBJECT_STORAGE_S3_BUCKET,
    region: cfg.OBJECT_STORAGE_S3_REGION,
    prefix: cfg.OBJECT_STORAGE_S3_PREFIX || null,
    credentials:
      cfg.OBJECT_STORAGE_S3_ACCESS_KEY_ID && cfg.OBJECT_STORAGE_S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: cfg.OBJECT_STORAGE_S3_ACCESS_KEY_ID,
            secretAccessKey: cfg.OBJECT_STORAGE_S3_SECRET_ACCESS_KEY
          }
        : undefined
  };
};

export const isDefaultStorageConfigured = () => getDefaultStorage() !== null;
