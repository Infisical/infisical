import { STSServiceException } from "@aws-sdk/client-sts";

import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { AWS_REQUEST_TIMEOUTS, createS3Bucket, TS3Bucket } from "@app/lib/aws/s3";
import { BadRequestError, DailyQuotaExceededError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { getDefaultStorage } from "@app/services/object-storage/object-storage-default-fns";

import { awsErrorLabel, isTemporaryAwsError, ObjectStorageError, toObjectStorageError } from "./object-storage-errors";
import { assertNamespacesValid } from "./object-storage-namespace-fns";
import { buildNamespaceFolder, buildObjectKey, buildProductFolder } from "./object-storage-path-fns";
import { ObjectStorageErrorReason, ObjectStorageType, TStorageConfig, TStorageNamespace } from "./object-storage-types";

// An org may upload this much a UTC day, across every product and both storage types. Each upload counts as at
// least 16 KiB, so many tiny files cost as much as a few large ones. It stops a modified client from filling a
// bucket; it is internal and not shown anywhere.
const DAILY_BYTES_CAP = 1024 * 1024 * 1024; // 1 GiB
const MIN_COUNTED_BYTES = 16 * 1024; // 16 KiB
const DAILY_COUNTER_TTL_SECONDS = 2 * 24 * 60 * 60; // 2 days, so the counter outlives its UTC day wherever it began
// The Redis client queues commands while Redis is down instead of failing, so without a deadline uploads would hang.
const DAILY_CAP_CHECK_TIMEOUT_MS = 250;

const DEFAULT_RETENTION_DAYS = 30;

type TObjectStorageServiceFactoryDep = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey" | "decryptWithInputKey">;
  keyStore: Pick<TKeyStoreFactory, "incrementByIfUnderLimitWithFixedExpiry">;
};

export type TObjectStorageServiceFactory = ReturnType<typeof objectStorageServiceFactory>;

export const objectStorageServiceFactory = ({
  appConnectionDAL,
  kmsService,
  keyStore
}: TObjectStorageServiceFactoryDep) => {
  const registeredNamespaces = new Map<string, TStorageNamespace>();

  // Throws at startup on a broken path, so a namespace that would share a folder never ships.
  const registerNamespaces = (namespaces: TStorageNamespace[]) => {
    assertNamespacesValid([...registeredNamespaces.values(), ...namespaces]);
    namespaces.forEach((namespace) => registeredNamespaces.set(namespace.id, namespace));
  };

  // One client per instance bucket, so the SDK's default credential chain (a pod role, say) isn't resolved again on
  // every request. Keyed by what the operator can change, so a config change gets a new client.
  const defaultClients = new Map<string, TS3Bucket>();

  const $openDefault = () => {
    const defaultStorage = getDefaultStorage();
    if (!defaultStorage) {
      throw new ObjectStorageError({
        reason: ObjectStorageErrorReason.Unconfigured,
        storageType: ObjectStorageType.Default
      });
    }
    const { bucket, region, prefix, credentials } = defaultStorage;
    const clientKey = `${bucket}|${region}|${credentials?.accessKeyId ?? ""}`;
    let s3 = defaultClients.get(clientKey);
    if (!s3) {
      s3 = createS3Bucket({ region, bucket, credentials });
      defaultClients.set(clientKey, s3);
    }
    return { s3, bucket, region, prefix };
  };

  const $openExternal = async (
    config: Extract<TStorageConfig, { storageType: ObjectStorageType.External }>,
    orgId: string
  ) => {
    const { bucket, region } = config;
    const fail = (reason: ObjectStorageErrorReason, details: ObjectStorageError["details"] = {}) =>
      new ObjectStorageError({
        reason,
        storageType: ObjectStorageType.External,
        details: { bucket, region, ...details }
      });

    const raw = await appConnectionDAL.findById(config.appConnectionId);
    if (raw && raw.orgId !== orgId) {
      logger.error(
        `objectStorage: the storage connection is in another organization [appConnectionId=${raw.id}] [orgId=${orgId}]`
      );
    }
    // Another org's connection reads exactly like a missing one, so its id can't be probed.
    if (!raw || raw.orgId !== orgId)
      throw fail(ObjectStorageErrorReason.ConnectionInvalid, { isConnectionMissing: true });
    if (raw.app !== AppConnection.AWS) {
      throw fail(ObjectStorageErrorReason.ConnectionInvalid, { connectionName: raw.name, connectionApp: raw.app });
    }

    let credentials: Awaited<ReturnType<typeof getAwsConnectionConfig>>["credentials"];
    try {
      const connection = await decryptAppConnection(raw, kmsService as Parameters<typeof decryptAppConnection>[1]);
      ({ credentials } = await getAwsConnectionConfig(
        { ...connection, projectType: config.projectType } as unknown as TAwsConnectionConfig,
        region,
        { stsRequestHandler: AWS_REQUEST_TIMEOUTS }
      ));
    } catch (err) {
      logger.warn({ err }, `objectStorage: could not use the AWS connection [appConnectionId=${raw.id}]`);
      if (isTemporaryAwsError(err)) throw fail(ObjectStorageErrorReason.Temporary, { connectionName: raw.name });
      throw fail(ObjectStorageErrorReason.ConnectionInvalid, {
        connectionName: raw.name,
        cause:
          err instanceof STSServiceException || err instanceof BadRequestError
            ? err.message
            : "Infisical could not load its credentials"
      });
    }

    return { s3: createS3Bucket({ region, bucket, credentials }), bucket, region, prefix: config.keyPrefix ?? null };
  };

  const capWarnedOn = new Map<string, string>();

  // Counts an upload against the org's day. Allows it when Redis doesn't answer in time: a missed count only
  // over-allows, while a stuck check would stop every upload.
  const $admitDailyBytes = async (orgId: string, bytes: number) => {
    const day = new Date().toISOString().slice(0, 10);
    let timer: NodeJS.Timeout | undefined;
    let total: number | "timeout";
    try {
      total = await Promise.race([
        keyStore.incrementByIfUnderLimitWithFixedExpiry(
          KeyStorePrefixes.ObjectStorageDailyBytes(orgId, day),
          Math.max(bytes, MIN_COUNTED_BYTES),
          DAILY_BYTES_CAP,
          DAILY_COUNTER_TTL_SECONDS
        ),
        new Promise<"timeout">((resolve) => {
          timer = setTimeout(() => resolve("timeout"), DAILY_CAP_CHECK_TIMEOUT_MS);
        })
      ]);
    } catch (error) {
      logger.warn(
        error,
        `objectStorage: could not count the upload against the daily cap, allowing it [orgId=${orgId}]`
      );
      return;
    } finally {
      clearTimeout(timer);
    }

    if (total === "timeout") {
      logger.warn(`objectStorage: the daily cap check timed out, allowing the upload [orgId=${orgId}]`);
      return;
    }
    if (total !== -1) return;

    if (capWarnedOn.get(orgId) !== day) {
      capWarnedOn.forEach((warnedDay, warnedOrgId) => {
        if (warnedDay !== day) capWarnedOn.delete(warnedOrgId);
      });
      capWarnedOn.set(orgId, day);
      logger.warn(`objectStorage: organization reached its daily upload cap [orgId=${orgId}] [day=${day}]`);
    }
    throw new DailyQuotaExceededError({
      message: "This organization has uploaded as much as it can today. Uploads resume after 00:00 UTC."
    });
  };

  const $retentionTag = (retentionDays?: number | null) => {
    let days = retentionDays ?? DEFAULT_RETENTION_DAYS;
    if (!Number.isSafeInteger(days) || days < 1) {
      logger.warn(`objectStorage: retention days '${String(retentionDays)}' isn't a positive whole number, using 30`);
      days = DEFAULT_RETENTION_DAYS;
    }
    return `retention=${days}d`;
  };

  // The instance's bucket is the operator's to set up, so problems with it go to the server logs at boot rather than to
  // any org admin. A tagged write is what uploads need, and the step most often missing from an IAM policy.
  const checkDefaultStorage = async () => {
    const defaultStorage = getDefaultStorage();
    if (!defaultStorage) return;
    const { s3, bucket, region, prefix } = $openDefault();
    const folder = `${prefix ? `${prefix}/` : ""}orgs/`;
    const describe = (error: unknown) => (error instanceof Error ? awsErrorLabel(error) : String(error));

    const listed = await s3.checkListAccess(folder);
    if (!listed.ok) {
      logger.error(
        listed.error,
        `objectStorage: default storage can't be listed, so session logs can't be read [bucket=${bucket}] [region=${region}] [prefix=${folder}] [error=${describe(listed.error)}]`
      );
      return;
    }
    const written = await s3.writeTestObject(`${folder}.check`, $retentionTag(DEFAULT_RETENTION_DAYS));
    if (!written.ok) {
      logger.error(
        written.error,
        `objectStorage: default storage refused a tagged test write, so uploads will fail; grant s3:PutObject and s3:PutObjectTagging [bucket=${bucket}] [region=${region}] [key=${folder}.check] [error=${describe(written.error)}]`
      );
      return;
    }
    logger.info(`objectStorage: default storage is ready [bucket=${bucket}] [region=${region}] [prefix=${folder}]`);
  };

  const at = (config: TStorageConfig) => ({
    forOrg: async (orgId: string) => {
      const { storageType } = config;
      const { s3, bucket, region, prefix } =
        config.storageType === ObjectStorageType.Default ? $openDefault() : await $openExternal(config, orgId);
      const isDefault = storageType === ObjectStorageType.Default;

      const wrap = (error: unknown, step?: "list" | "write") =>
        toObjectStorageError(error, { storageType, bucket, region, step });

      const namespace = (ns: TStorageNamespace) => {
        if (registeredNamespaces.get(ns.id) !== ns) {
          throw new Error(`Storage namespace "${ns.id}" was used without being registered`);
        }
        const productFolder = buildProductFolder({ prefix, orgId, product: ns.product });

        // Read-only and cheap, for health checks: lists the product's folder, where a prefix-scoped IAM policy allows.
        const listAccess = async () => {
          const listed = await s3.checkListAccess(productFolder);
          if (!listed.ok) throw wrap(listed.error, "list");
        };

        // Only for a customer's bucket, when they set it up: the instance's bucket is the operator's to check.
        const check = async () => {
          if (isDefault) throw new Error("Only external storage is checked on save");
          await listAccess();
          const written = await s3.writeTestObject(`${productFolder}.check`);
          if (!written.ok) throw wrap(written.error, "write");
        };

        const presignCorsProbe = async (expiresInSeconds: number) => {
          if (isDefault) throw new Error("Only external storage has a CORS probe");
          try {
            return await s3.presignGet(`${productFolder}.cors-probe`, expiresInSeconds);
          } catch (error) {
            throw wrap(error);
          }
        };

        const folder = (ids: Record<string, string>) => {
          const folderPrefix = buildNamespaceFolder(productFolder, ns, ids);

          const presignPut = async ({
            name,
            bytes,
            sha256Base64,
            expiresInSeconds,
            retentionDays
          }: {
            name: string;
            bytes: number;
            sha256Base64: string;
            expiresInSeconds: number;
            retentionDays?: number | null;
          }) => {
            const key = buildObjectKey(folderPrefix, name);
            await $admitDailyBytes(orgId, bytes);
            try {
              const url = await s3.presignCreateOnlyPut({
                key,
                contentLength: bytes,
                sha256Base64,
                expiresInSeconds,
                // Default storage deletes by an S3 lifecycle rule on this tag; a customer's bucket is theirs to manage.
                tagging: isDefault ? $retentionTag(retentionDays) : undefined
              });
              return { key, url };
            } catch (error) {
              throw wrap(error);
            }
          };

          const list = async ({ startAfter, maxKeys }: { startAfter?: string; maxKeys: number }) => {
            try {
              return await s3.listPage({ prefix: folderPrefix, startAfter, maxKeys });
            } catch (error) {
              throw wrap(error, "list");
            }
          };

          const presignGet = async (key: string, expiresInSeconds: number) => {
            if (!key.startsWith(folderPrefix)) throw new Error("Refusing to sign a link outside the folder");
            try {
              return await s3.presignGet(key, expiresInSeconds);
            } catch (error) {
              throw wrap(error);
            }
          };

          return { prefix: folderPrefix, presignPut, list, presignGet };
        };

        return { productFolder, listAccess, check, presignCorsProbe, folder };
      };

      return { storageType, bucket, namespace };
    }
  });

  return { registerNamespaces, at, checkDefaultStorage };
};
