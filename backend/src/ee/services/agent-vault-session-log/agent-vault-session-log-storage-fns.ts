import { STSServiceException } from "@aws-sdk/client-sts";

import { ProjectType } from "@app/db/schemas";
import { createS3Bucket } from "@app/lib/aws/s3";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import {
  AGENT_VAULT_SESSION_LOG_MAX_PAGE_CHUNKS,
  AGENT_VAULT_SESSION_LOG_PRESIGN_EXPIRY_SECONDS
} from "./agent-vault-session-log-constants";
import { withKeyPrefix } from "./agent-vault-session-log-fns";
import { TResolvedSessionLogStorageConfig } from "./agent-vault-session-log-types";

type TStorageDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey" | "decryptWithInputKey">;
};

export type TAgentVaultSessionLogStorage = Awaited<ReturnType<typeof buildSessionLogStorage>>;

export const buildSessionLogStorage = async (
  config: TResolvedSessionLogStorageConfig,
  orgId: string,
  { appConnectionDAL, kmsService }: TStorageDeps
) => {
  const raw = await appConnectionDAL.findById(config.appConnectionId);
  if (raw && raw.orgId !== orgId) {
    logger.error(
      `Agent Vault session log connection is in another organization [appConnectionId=${raw.id}] [orgId=${orgId}]`
    );
  }
  if (!raw || raw.orgId !== orgId) {
    throw new BadRequestError({
      message: "The AWS connection used for session logs no longer exists. Choose another on the Settings page."
    });
  }
  if (raw.app !== AppConnection.AWS) {
    throw new BadRequestError({
      message: `The connection used for session logs is a ${raw.app} connection. Session logs require an AWS connection`
    });
  }

  let credentials: Awaited<ReturnType<typeof getAwsConnectionConfig>>["credentials"];
  try {
    const connection = await decryptAppConnection(raw, kmsService as Parameters<typeof decryptAppConnection>[1]);
    // Session logs only accept org connections or Agent Vault's own, and both assume the role with the org ID.
    ({ credentials } = await getAwsConnectionConfig(
      { ...connection, projectType: ProjectType.AgentVault } as unknown as TAwsConnectionConfig,
      config.region
    ));
  } catch (err) {
    logger.warn({ err }, `Agent Vault session logs could not use their AWS connection [appConnectionId=${raw.id}]`);
    const reason =
      err instanceof STSServiceException || err instanceof BadRequestError
        ? err.message
        : "Infisical could not load its credentials";
    throw new BadRequestError({
      message: `Couldn't use the AWS connection '${raw.name}' for session logs: ${reason}`
    });
  }

  const { bucket, keyPrefix } = config;
  const s3 = createS3Bucket({ region: config.region, bucket, credentials });

  const presignPut = async ({
    objectKey,
    ciphertextBytes,
    ciphertextSha256
  }: {
    objectKey: string;
    ciphertextBytes: number;
    ciphertextSha256: string;
  }) =>
    s3.presignCreateOnlyPut({
      key: objectKey,
      contentLength: ciphertextBytes,
      // The proxy sends it unpadded; S3 wants the padded form
      sha256Base64: `${ciphertextSha256}=`,
      expiresInSeconds: AGENT_VAULT_SESSION_LOG_PRESIGN_EXPIRY_SECONDS
    });

  const presignGet = async (objectKey: string) =>
    s3.presignGet(objectKey, AGENT_VAULT_SESSION_LOG_PRESIGN_EXPIRY_SECONDS);

  const listChunks = async ({ folder, startAfter }: { folder: string; startAfter?: string }) =>
    s3.listPage({ prefix: folder, startAfter, maxKeys: AGENT_VAULT_SESSION_LOG_MAX_PAGE_CHUNKS });

  const mintCorsProbeUrl = async () => presignGet(withKeyPrefix(keyPrefix, ".cors-probe"));

  const unreachableMessage = `Unable to reach bucket '${bucket}'. Check the bucket name, the region, and that the connection's credentials allow s3:ListBucket on it`;

  const validate = async () => {
    const testKey = withKeyPrefix(keyPrefix, ".test/write-check");
    const access = await s3.checkAccess(testKey);
    if (access.ok) return;

    logger.warn(
      { err: access.error, bucket, testKey },
      `Agent Vault session logs bucket check failed [bucket=${bucket}] [failure=${access.failure}]`
    );
    throw new BadRequestError({
      message:
        access.failure === "unreachable"
          ? unreachableMessage
          : `Bucket '${bucket}' is reachable but writing to it failed. Grant s3:PutObject on the configured key prefix`
    });
  };

  // Read-only, so it is safe to call often: it can't tell whether writes still work.
  const assertReachable = async () => {
    const reachable = await s3.checkReachable();
    if (reachable.ok) return;

    logger.warn({ err: reachable.error, bucket }, `Agent Vault session logs bucket is unreachable [bucket=${bucket}]`);
    throw new BadRequestError({ message: unreachableMessage });
  };

  return { presignPut, presignGet, listChunks, mintCorsProbeUrl, validate, assertReachable };
};
