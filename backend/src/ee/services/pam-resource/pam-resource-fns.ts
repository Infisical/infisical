import { TPamResources } from "@app/db/schemas";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { decryptAccountCredentials } from "../pam-account/pam-account-fns";
import { getAwsIamResourceListItem } from "./aws-iam/aws-iam-resource-fns";
import { getKubernetesResourceListItem } from "./kubernetes/kubernetes-resource-fns";
import { getMySQLResourceListItem } from "./mysql/mysql-resource-fns";
import { TPamResource, TPamResourceConnectionDetails, TPamResourceMetadata } from "./pam-resource-types";
import { getPostgresResourceListItem } from "./postgres/postgres-resource-fns";
import { getRedisResourceListItem } from "./redis/redis-resource-fns";
import { getWindowsResourceListItem } from "./windows-server/windows-server-resource-fns";

export const listResourceOptions = () => {
  return [
    getPostgresResourceListItem(),
    getMySQLResourceListItem(),
    getAwsIamResourceListItem(),
    getKubernetesResourceListItem(),
    getRedisResourceListItem(),
    getWindowsResourceListItem()
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
export const encryptResourceMetadata = async ({
  projectId,
  metadata,
  kmsService
}: {
  projectId: string;
  metadata: TPamResourceMetadata;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  const { cipherTextBlob } = encryptor({
    plainText: Buffer.from(JSON.stringify(metadata))
  });

  return cipherTextBlob;
};

export const decryptResourceMetadata = async <T extends TPamResourceMetadata>({
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
  return {
    ...resource,
    connectionDetails: await decryptResourceConnectionDetails({
      encryptedConnectionDetails: resource.encryptedConnectionDetails,
      projectId,
      kmsService
    }),
    rotationAccountCredentials: resource.encryptedRotationAccountCredentials
      ? await decryptAccountCredentials({
          encryptedCredentials: resource.encryptedRotationAccountCredentials,
          projectId,
          kmsService
        })
      : null
  } as TPamResource;
};
