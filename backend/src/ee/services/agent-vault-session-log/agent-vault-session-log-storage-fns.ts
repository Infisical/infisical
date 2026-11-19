import { ProjectType, TAgentVaultSessionLogConfigs } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { isDefaultStorageConfigured } from "@app/services/object-storage/object-storage-default-fns";
import { ObjectStorageError } from "@app/services/object-storage/object-storage-errors";
import {
  ObjectStorageErrorReason,
  ObjectStorageType,
  TStorageConfig
} from "@app/services/object-storage/object-storage-types";

import { TAgentVaultSessionLogConfigDALFactory } from "./agent-vault-session-log-config-dal";
import {
  AGENT_VAULT_SESSION_LOG_DEFAULT_STORAGE_UNAVAILABLE_MESSAGE,
  AGENT_VAULT_SESSION_LOG_DEFAULT_STORAGE_UNAVAILABLE_SELF_HOSTED_MESSAGE
} from "./agent-vault-session-log-constants";

export type TSessionLogStorage =
  | { type: ObjectStorageType.Default }
  | {
      type: ObjectStorageType.External;
      appConnectionId: string;
      bucket: string;
      region: AWSRegion;
      keyPrefix: string | null;
    };

export type TEffectiveSessionLogConfig = { enabled: boolean; isSaved: boolean; storage: TSessionLogStorage };

// What session logs do for a project, from its saved row and whether the instance has a bucket. With nothing saved,
// session logs are on in default storage. Without an instance bucket there is no default storage, so a saved
// default choice, or nothing saved, means there are no settings. It never looks at the plan.
export const toEffectiveSessionLogConfig = (
  row:
    | Pick<
        TAgentVaultSessionLogConfigs,
        "enabled" | "storageType" | "appConnectionId" | "bucket" | "region" | "keyPrefix"
      >
    | null
    | undefined,
  hasDefaultStorage: boolean
): TEffectiveSessionLogConfig | null => {
  if (row?.storageType === ObjectStorageType.External && row.appConnectionId && row.bucket && row.region) {
    return {
      enabled: row.enabled,
      isSaved: true,
      storage: {
        type: ObjectStorageType.External,
        appConnectionId: row.appConnectionId,
        bucket: row.bucket,
        region: row.region as AWSRegion,
        keyPrefix: row.keyPrefix || null
      }
    };
  }
  if (!hasDefaultStorage) return null;
  const enabled = row ? row.storageType === ObjectStorageType.Default && row.enabled : true;
  return { enabled, isSaved: Boolean(row), storage: { type: ObjectStorageType.Default } };
};

export const getEffectiveSessionLogConfig = async (
  {
    agentVaultSessionLogConfigDAL
  }: {
    agentVaultSessionLogConfigDAL: Pick<
      TAgentVaultSessionLogConfigDALFactory,
      "findOne" | "findByProjectIdFromPrimary"
    >;
  },
  projectId: string,
  { fromPrimary }: { fromPrimary: boolean }
) => {
  const row = fromPrimary
    ? await agentVaultSessionLogConfigDAL.findByProjectIdFromPrimary(projectId)
    : await agentVaultSessionLogConfigDAL.findOne({ projectId });
  return toEffectiveSessionLogConfig(row, isDefaultStorageConfigured());
};

// The storage a settings save replaced: what the audit log records as "previous".
export type TPreviousSessionLogStorage = {
  storageType: ObjectStorageType;
  appConnectionId: string | null;
  appConnectionName: string | null;
  bucket: string | null;
  region: string | null;
  keyPrefix: string | null;
};

// Turning off on an instance without default storage reads back as no settings, and is still recorded as off. Off has no
// storage, so its storage type is null rather than the default columns an off row is saved with.
export const buildSessionLogSettingsAuditMetadata = ({
  settings,
  appConnectionName,
  previous
}: {
  settings: Pick<TEffectiveSessionLogConfig, "enabled" | "storage"> | null;
  appConnectionName: string | null;
  previous: TPreviousSessionLogStorage | null;
}) => {
  const external = settings?.storage.type === ObjectStorageType.External ? settings.storage : null;
  return {
    enabled: settings?.enabled ?? false,
    storageType: settings?.enabled ? settings.storage.type : null,
    appConnectionId: external?.appConnectionId ?? null,
    appConnectionName,
    bucket: external?.bucket ?? null,
    region: external?.region ?? null,
    keyPrefix: external?.keyPrefix ?? null,
    previousStorageType: previous?.storageType ?? null,
    previousAppConnectionId: previous?.appConnectionId ?? null,
    previousAppConnectionName: previous?.appConnectionName ?? null,
    previousBucket: previous?.bucket ?? null,
    previousRegion: previous?.region ?? null,
    previousKeyPrefix: previous?.keyPrefix ?? null
  };
};

export const toStorageConfig = (storage: TSessionLogStorage): TStorageConfig =>
  storage.type === ObjectStorageType.Default
    ? { storageType: ObjectStorageType.Default }
    : {
        storageType: ObjectStorageType.External,
        appConnectionId: storage.appConnectionId,
        bucket: storage.bucket,
        region: storage.region,
        keyPrefix: storage.keyPrefix,
        projectType: ProjectType.AgentVault
      };

const UNREACHABLE_BUCKET_MESSAGE = (bucket: string) =>
  `Unable to reach bucket '${bucket}'. Check the bucket name, the region, and that the connection's credentials allow s3:ListBucket on it`;

// The message an admin sees for a storage failure, and whether trying again later can help (a 500) or the settings
// need fixing (a 400). Default storage always gets the generic message and counts as temporary: its bucket belongs to
// whoever runs the instance, who finds the cause in the server logs, and an org admin can't fix it in settings.
export const describeStorageFailure = (error: ObjectStorageError, use: "read" | "check") => {
  if (error.storageType === ObjectStorageType.Default) {
    return {
      isTemporary: true,
      message: getConfig().isCloud
        ? AGENT_VAULT_SESSION_LOG_DEFAULT_STORAGE_UNAVAILABLE_MESSAGE
        : AGENT_VAULT_SESSION_LOG_DEFAULT_STORAGE_UNAVAILABLE_SELF_HOSTED_MESSAGE
    };
  }

  const { reason, details } = error;
  const bucket = details.bucket ?? "";
  const isTemporary = reason === ObjectStorageErrorReason.Temporary;

  if (reason === ObjectStorageErrorReason.ConnectionInvalid) {
    if (details.isConnectionMissing) {
      return {
        isTemporary,
        message: "The AWS connection used for session logs no longer exists. Choose another on the Settings page."
      };
    }
    if (details.connectionApp) {
      return {
        isTemporary,
        message: `The connection used for session logs is a ${details.connectionApp} connection. Session logs require an AWS connection`
      };
    }
    return {
      isTemporary,
      message: `Couldn't use the AWS connection '${details.connectionName ?? ""}' for session logs: ${details.cause ?? "Infisical could not load its credentials"}`
    };
  }
  if (isTemporary && details.connectionName && !details.awsErrorCode) {
    return {
      isTemporary,
      message: `Couldn't reach AWS to use the connection '${details.connectionName}' for session logs. Try again in a bit.`
    };
  }

  if (isTemporary && use === "check") {
    return { isTemporary, message: `Couldn't reach bucket '${bucket}' just now. Try again in a bit.` };
  }

  if (use === "check") {
    return {
      isTemporary: false,
      message:
        details.step === "write"
          ? `Bucket '${bucket}' is reachable but writing to it failed. Grant s3:PutObject on the configured key prefix`
          : UNREACHABLE_BUCKET_MESSAGE(bucket)
    };
  }

  const code = details.awsErrorCode ?? "";
  let hint = "Check the AWS connection and the bucket settings.";
  if (isTemporary) hint = "S3 isn't responding. Try again in a bit.";
  else if (reason === ObjectStorageErrorReason.CredentialsInvalid) hint = "Check the AWS connection's credentials.";
  else if (reason === ObjectStorageErrorReason.AccessDenied) {
    hint = "Check that the connection's credentials allow s3:ListBucket on it.";
  } else if (reason === ObjectStorageErrorReason.BucketNotFound) hint = "Check the bucket name and region in Settings.";
  return {
    isTemporary,
    message: `Infisical couldn't list session logs in bucket '${bucket}'${code ? ` (${code})` : ""}. ${hint}`
  };
};

// A 500 when trying again later can help, a 400 when the settings or the storage need fixing.
export const toSessionLogStorageHttpError = ({
  isTemporary,
  message,
  name
}: {
  isTemporary: boolean;
  message: string;
  name?: string;
}) => (isTemporary ? new InternalServerError({ name, message }) : new BadRequestError({ name, message }));

export const isSameSessionLogStorage = (a: TSessionLogStorage, b?: TSessionLogStorage) => {
  if (!b || a.type !== b.type) return false;
  if (a.type === ObjectStorageType.Default || b.type === ObjectStorageType.Default) return true;
  return (
    a.appConnectionId === b.appConnectionId &&
    a.bucket === b.bucket &&
    a.region === b.region &&
    (a.keyPrefix || null) === (b.keyPrefix || null)
  );
};

export const toSessionLogSettingsState = (settings: TEffectiveSessionLogConfig | null) => ({
  settings: settings && { enabled: settings.enabled, storage: settings.storage },
  defaultStorage: { configured: isDefaultStorageConfigured() }
});

export const toSessionLogStorageColumns = (storage: TSessionLogStorage) =>
  storage.type === ObjectStorageType.Default
    ? { storageType: storage.type, appConnectionId: null, bucket: null, region: null, keyPrefix: null }
    : {
        storageType: storage.type,
        appConnectionId: storage.appConnectionId,
        bucket: storage.bucket,
        region: storage.region,
        keyPrefix: storage.keyPrefix || null
      };
