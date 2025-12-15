import { TPamResources } from "@app/db/schemas";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { decryptAccountCredentials } from "../pam-account/pam-account-fns";
import { getAwsIamResourceListItem } from "./aws-iam/aws-iam-resource-fns";
import { getKubernetesResourceListItem } from "./kubernetes/kubernetes-resource-fns";
import { getMySQLResourceListItem } from "./mysql/mysql-resource-fns";
import { TPamResource, TPamResourceConnectionDetails } from "./pam-resource-types";
import { getPostgresResourceListItem } from "./postgres/postgres-resource-fns";

export const listResourceOptions = () => {
  return [
    getPostgresResourceListItem(),
    getMySQLResourceListItem(),
    getAwsIamResourceListItem(),
    getKubernetesResourceListItem()
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
