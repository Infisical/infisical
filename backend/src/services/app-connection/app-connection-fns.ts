import { AppConnection, AppConnectionListItem, TAppConnection, TAppConnectionConfig } from "@app/lib/app-connections";
import { getAwsAppConnectionListItem, validateAwsConnectionCredentials } from "@app/lib/app-connections/aws";
import { getGitHubConnectionListItem, validateGitHubConnectionCredentials } from "@app/lib/app-connections/github";
import { TAppConnectionServiceFactoryDep } from "@app/services/app-connection/app-connection-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

export const listAppConnectionOptions = (): (AppConnectionListItem & Record<string, unknown>)[] => {
  return [getAwsAppConnectionListItem(), getGitHubConnectionListItem()].sort((a, b) => a.name.localeCompare(b.name));
};

export const encryptAppConnectionCredentials = async ({
  orgId,
  credentials,
  kmsService
}: {
  orgId: string;
  credentials: TAppConnection["credentials"];
  kmsService: TAppConnectionServiceFactoryDep["kmsService"];
}) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId
  });

  const { cipherTextBlob: encryptedCredentialsBlob } = encryptor({
    plainText: Buffer.from(JSON.stringify(credentials))
  });

  return encryptedCredentialsBlob;
};

export const decryptAppConnectionCredentials = async ({
  orgId,
  encryptedCredentials,
  kmsService
}: {
  orgId: string;
  encryptedCredentials: Buffer;
  kmsService: TAppConnectionServiceFactoryDep["kmsService"];
}) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId
  });

  const decryptedPlainTextBlob = decryptor({
    cipherTextBlob: encryptedCredentials
  });

  return JSON.parse(decryptedPlainTextBlob.toString()) as TAppConnection["credentials"];
};

export const validateAppConnectionCredentials = async (
  appConnection: TAppConnectionConfig
): Promise<TAppConnection["credentials"]> => {
  const { app } = appConnection;
  switch (app) {
    case AppConnection.AWS: {
      return validateAwsConnectionCredentials(appConnection);
    }
    case AppConnection.GitHub:
      return validateGitHubConnectionCredentials(appConnection);
    default:
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`Unhandled App Connection ${app}`);
  }
};
