import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { THoneyTokenProviderHooks } from "../honey-token-service-types";
import { AwsHoneyTokenConfigSchema } from "../honey-token-types";
import {
  createAwsIamHoneyTokenCredentials,
  parseAwsHoneyTokenDecryptedCredentials,
  revokeAwsIamHoneyTokenCredentials,
  verifyAwsStackDeployment
} from "./honey-token-aws-fns";

type THoneyTokenAwsProviderHookFactoryDep = {
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
};

export const honeyTokenAwsProviderHooksFactory = ({
  kmsService,
  appConnectionDAL
}: THoneyTokenAwsProviderHookFactoryDep): THoneyTokenProviderHooks => ({
  createCredentials: (appConnection) =>
    createAwsIamHoneyTokenCredentials({
      appConnection
    }).then((credentials) => ({
      credentials,
      tokenIdentifier: credentials.accessKeyId
    })),
  revokeCredentials: ({ appConnection, credentials }) =>
    revokeAwsIamHoneyTokenCredentials({
      appConnection,
      iamUserName: credentials.iamUserName,
      accessKeyId: credentials.accessKeyId
    }),
  verifyDeployment: async ({ connectionId, orgId, encryptedConfig }) => {
    const { decryptor: configDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });
    const config = encryptedConfig
      ? AwsHoneyTokenConfigSchema.parse(
          JSON.parse(configDecryptor({ cipherTextBlob: encryptedConfig }).toString()) as unknown
        )
      : null;

    return verifyAwsStackDeployment({
      connectionId,
      stackName: config?.stackName ?? "infisical-honey-tokens",
      awsRegion: config?.awsRegion ?? "us-east-1",
      appConnectionDAL,
      kmsService
    });
  },
  getCredentialsForDisplay: async ({ encryptedCredentials, projectId }) => {
    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    const decryptedCredentials = parseAwsHoneyTokenDecryptedCredentials(
      JSON.parse(decryptor({ cipherTextBlob: encryptedCredentials }).toString()) as unknown
    );
    return {
      accessKeyId: decryptedCredentials.accessKeyId,
      secretAccessKey: decryptedCredentials.secretAccessKey
    };
  }
});
