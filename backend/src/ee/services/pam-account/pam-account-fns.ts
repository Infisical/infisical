import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { PamResource } from "../pam-resource/pam-resource-enums";
import { TPamAccountCredentials, TPamResourceInternalMetadata } from "../pam-resource/pam-resource-types";
import { SSHAuthMethod } from "../pam-resource/ssh/ssh-resource-enums";

type TAccountParentResource = {
  id: string;
  name: string;
  resourceType: string;
  encryptedRotationAccountCredentials?: Buffer | null;
};

type TAccountParentDomain = {
  id: string;
  name: string;
  domainType: string;
};

export const formatAccountParent = ({
  resource,
  domain
}: {
  resource?: TAccountParentResource | null;
  domain?: TAccountParentDomain | null;
}) => ({
  parentType: resource?.resourceType ?? domain?.domainType ?? "",
  resource: resource
    ? {
        id: resource.id,
        name: resource.name,
        resourceType: resource.resourceType,
        rotationCredentialsConfigured: Boolean(resource.encryptedRotationAccountCredentials)
      }
    : null,
  domain: domain
    ? {
        id: domain.id,
        name: domain.name,
        domainType: domain.domainType
      }
    : null
});

export const encryptAccountCredentials = async ({
  projectId,
  credentials,
  kmsService
}: {
  projectId: string;
  credentials: TPamAccountCredentials;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  const { cipherTextBlob: encryptedCredentialsBlob } = encryptor({
    plainText: Buffer.from(JSON.stringify(credentials))
  });

  return encryptedCredentialsBlob;
};

export const decryptAccountCredentials = async ({
  projectId,
  encryptedCredentials,
  kmsService
}: {
  projectId: string;
  encryptedCredentials: Buffer;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  const decryptedPlainTextBlob = decryptor({
    cipherTextBlob: encryptedCredentials
  });

  return JSON.parse(decryptedPlainTextBlob.toString()) as TPamAccountCredentials;
};

export const decryptAccountMessage = async ({
  projectId,
  encryptedMessage,
  kmsService
}: {
  projectId: string;
  encryptedMessage: Buffer;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  const decryptedPlainTextBlob = decryptor({
    cipherTextBlob: encryptedMessage
  });

  return decryptedPlainTextBlob.toString();
};

// Returns false for account types where all credential fields are already visible in the sanitized view
export const hasSensitiveCredentials = (parentType: string, credentials: TPamAccountCredentials): boolean => {
  if (parentType === PamResource.AwsIam) return false;
  if (parentType === PamResource.Kubernetes) return false;
  if (
    parentType === PamResource.SSH &&
    "authMethod" in credentials &&
    credentials.authMethod === SSHAuthMethod.Certificate
  )
    return false;
  return true;
};

const hasConfiguredCredentials = (credentials: TPamAccountCredentials): boolean => {
  if ("password" in credentials && credentials.password) return true;
  if ("privateKey" in credentials && credentials.privateKey) return true;
  if ("serviceAccountToken" in credentials && credentials.serviceAccountToken) return true;
  if ("targetRoleArn" in credentials && credentials.targetRoleArn) return true;
  if ("authMethod" in credentials && credentials.authMethod === SSHAuthMethod.Certificate) return true;
  return false;
};

export const decryptAccount = async <
  T extends { encryptedCredentials: Buffer; encryptedLastRotationMessage?: Buffer | null; internalMetadata?: unknown }
>(
  account: T,
  projectId: string,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
): Promise<
  Omit<T, "encryptedCredentials" | "encryptedLastRotationMessage" | "internalMetadata"> & {
    credentials: TPamAccountCredentials;
    credentialsConfigured: boolean;
    lastRotationMessage: string | null;
    internalMetadata?: TPamResourceInternalMetadata;
  }
> => {
  const { encryptedCredentials, encryptedLastRotationMessage, internalMetadata, ...rest } = account;

  const credentials = await decryptAccountCredentials({
    encryptedCredentials,
    projectId,
    kmsService
  });

  return {
    ...rest,
    credentials,
    internalMetadata: internalMetadata as TPamResourceInternalMetadata | undefined,
    credentialsConfigured: hasConfiguredCredentials(credentials),
    lastRotationMessage: encryptedLastRotationMessage
      ? await decryptAccountMessage({
          encryptedMessage: encryptedLastRotationMessage,
          projectId,
          kmsService
        })
      : null
  };
};
