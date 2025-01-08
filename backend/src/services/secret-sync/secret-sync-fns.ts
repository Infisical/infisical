import { BadRequestError } from "@app/lib/errors";
import {
  AWS_PARAMETER_STORE_SYNC_LIST_OPTION,
  AwsParameterStoreSyncFns
} from "@app/services/secret-sync/aws-parameter-store";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import {
  TSecretMap,
  TSecretSyncListItem,
  TSecretSyncWithConnection
} from "@app/services/secret-sync/secret-sync-types";

const SECRET_SYNC_LIST_OPTIONS: Record<SecretSync, TSecretSyncListItem> = {
  [SecretSync.AWSParameterStore]: AWS_PARAMETER_STORE_SYNC_LIST_OPTION
};

export const listSecretSyncOptions = () => {
  return Object.values(SECRET_SYNC_LIST_OPTIONS).sort((a, b) => a.name.localeCompare(b.name));
};

const processSyncOptions = (secretSync: TSecretSyncWithConnection, unprocessedSecretMap: TSecretMap) => {
  let secretMap = { ...unprocessedSecretMap };

  const { appendSuffix, prependPrefix } = secretSync.syncOptions;

  if (appendSuffix || prependPrefix) {
    secretMap = {};
    Object.entries(unprocessedSecretMap).forEach(([key, value]) => {
      secretMap[`${prependPrefix || ""}${key}${appendSuffix || ""}`] = value;
    });
  }

  return secretMap;
};

export const SecretSyncFns = {
  sync: (secretSync: TSecretSyncWithConnection, unprocessedSecretMap: TSecretMap): Promise<void> => {
    const secretMap = processSyncOptions(secretSync, unprocessedSecretMap);

    switch (secretSync.destination) {
      case SecretSync.AWSParameterStore:
        return AwsParameterStoreSyncFns.sync(secretSync, secretMap);
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new Error(`Unhandled sync destination for push secrets: ${secretSync.destination}`);
    }
  },
  import: (secretSync: TSecretSyncWithConnection): Promise<TSecretMap> => {
    switch (secretSync.destination) {
      case SecretSync.AWSParameterStore:
        return AwsParameterStoreSyncFns.import(secretSync);
      default:
        throw new BadRequestError({
          message: `${SECRET_SYNC_NAME_MAP[secretSync.destination as SecretSync]} Syncs do not support pulling.`
        });
    }
  },
  erase: (secretSync: TSecretSyncWithConnection, unprocessedSecretMap: TSecretMap): Promise<void> => {
    const secretMap = processSyncOptions(secretSync, unprocessedSecretMap);

    switch (secretSync.destination) {
      case SecretSync.AWSParameterStore:
        return AwsParameterStoreSyncFns.erase(secretSync, secretMap);
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new Error(`Unhandled sync destination for purging secrets: ${secretSync.destination}`);
    }
  }
};
