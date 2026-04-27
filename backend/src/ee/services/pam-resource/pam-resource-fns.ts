import { TPamResources } from "@app/db/schemas";
import { logger } from "@app/lib/logger";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { decryptAccountCredentials } from "../pam-account/pam-account-fns";
import { getAwsIamResourceListItem } from "./aws-iam/aws-iam-resource-fns";
import { getKubernetesResourceListItem } from "./kubernetes/kubernetes-resource-fns";
import { getMongoDBResourceListItem } from "./mongodb/mongodb-resource-fns";
import { getMsSQLResourceListItem } from "./mssql/mssql-resource-fns";
import { getMySQLResourceListItem } from "./mysql/mysql-resource-fns";
import { TPamResource, TPamResourceConnectionDetails, TPamResourceInternalMetadata } from "./pam-resource-types";
import { getPostgresResourceListItem } from "./postgres/postgres-resource-fns";
import { getRedisResourceListItem } from "./redis/redis-resource-fns";
import { getSshResourceListItem } from "./ssh/ssh-resource-fns";
import { getWindowsResourceListItem } from "./windows-server/windows-server-resource-fns";

export const listResourceOptions = () => {
  return [
    getPostgresResourceListItem(),
    getMySQLResourceListItem(),
    getMsSQLResourceListItem(),
    getAwsIamResourceListItem(),
    getKubernetesResourceListItem(),
    getRedisResourceListItem(),
    getMongoDBResourceListItem(),
    getWindowsResourceListItem(),
    getSshResourceListItem()
  ].sort((a, b) => a.name.localeCompare(b.name));
};

// Resource
export const encryptResourceConnectionDetails = async ({
  projectId,
  connectionDetails,
  kmsService
}: {
  projectId: string;
  connectionDetails: TPamResourceConnectionDetails;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  const { cipherTextBlob: encryptedConnectionDetailsBlob } = encryptor({
    plainText: Buffer.from(JSON.stringify(connectionDetails))
  });

  return encryptedConnectionDetailsBlob;
};

export const decryptResourceConnectionDetails = async ({
  projectId,
  encryptedConnectionDetails,
  kmsService
}: {
  projectId: string;
  encryptedConnectionDetails: Buffer;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  const decryptedPlainTextBlob = decryptor({
    cipherTextBlob: encryptedConnectionDetails
  });

  return JSON.parse(decryptedPlainTextBlob.toString()) as TPamResourceConnectionDetails;
};

// Resource Metadata
export const encryptResourceInternalMetadata = async ({
  projectId,
  internalMetadata,
  kmsService
}: {
  projectId: string;
  internalMetadata: TPamResourceInternalMetadata;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  const { cipherTextBlob } = encryptor({
    plainText: Buffer.from(JSON.stringify(internalMetadata))
  });

  return cipherTextBlob;
};

export const decryptResourceMetadata = async <T extends TPamResourceInternalMetadata>({
  projectId,
  encryptedMetadata,
  kmsService
}: {
  projectId: string;
  encryptedMetadata: Buffer;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  const decryptedPlainTextBlob = decryptor({
    cipherTextBlob: encryptedMetadata
  });

  return JSON.parse(decryptedPlainTextBlob.toString()) as T;
};

export const decryptResource = async (
  resource: TPamResources,
  projectId: string,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const {
    encryptedConnectionDetails,
    encryptedRotationAccountCredentials,
    encryptedResourceMetadata,
    encryptedSessionSummaryConfig,
    ...rest
  } = resource;

  let sessionSummaryConfig: { aiInsightsEnabled: boolean; connectionId: string; model: string } | null = null;

  if (encryptedSessionSummaryConfig) {
    try {
      const { decryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });
      sessionSummaryConfig = JSON.parse(decryptor({ cipherTextBlob: encryptedSessionSummaryConfig }).toString()) as {
        aiInsightsEnabled: boolean;
        connectionId: string;
        model: string;
      };
    } catch (err) {
      logger.warn(
        { err, resourceId: resource.id },
        "decryptResource: failed to decrypt sessionSummaryConfig, falling back to null"
      );
    }
  }

  return {
    ...rest,
    connectionDetails: await decryptResourceConnectionDetails({
      encryptedConnectionDetails,
      projectId,
      kmsService
    }),
    rotationAccountCredentials: encryptedRotationAccountCredentials
      ? await decryptAccountCredentials({
          encryptedCredentials: encryptedRotationAccountCredentials,
          projectId,
          kmsService
        })
      : null,
    sessionSummaryConfig
  } as TPamResource;
};
