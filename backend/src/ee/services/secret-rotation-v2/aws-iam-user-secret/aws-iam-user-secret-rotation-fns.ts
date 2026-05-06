import {
  type AccessKeyMetadata,
  CreateAccessKeyCommand,
  DeleteAccessKeyCommand,
  IAMClient,
  ListAccessKeysCommand
} from "@aws-sdk/client-iam";

import {
  TAwsIamUserSecretRotationGeneratedCredentials,
  TAwsIamUserSecretRotationWithConnection
} from "@app/ee/services/secret-rotation-v2/aws-iam-user-secret/aws-iam-user-secret-rotation-types";
import {
  TRotationFactory,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws";

const getCreateDate = (key: AccessKeyMetadata): number => {
  return key.CreateDate ? new Date(key.CreateDate).getTime() : 0;
};

export const awsIamUserSecretRotationFactory: TRotationFactory<
  TAwsIamUserSecretRotationWithConnection,
  TAwsIamUserSecretRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    parameters: { region, userName },
    connection,
    secretsMapping
  } = secretRotation;

  const $rotateClientSecret = async () => {
    const { credentials, region: resolvedRegion } = await getAwsConnectionConfig(connection, region);
    const iam = new IAMClient({ credentials, region: resolvedRegion });

    const { AccessKeyMetadata } = await iam.send(new ListAccessKeysCommand({ UserName: userName }));

    if (AccessKeyMetadata && AccessKeyMetadata.length > 0) {
      // Sort keys by creation date (oldest first)
      const sortedKeys = [...AccessKeyMetadata].sort((a, b) => getCreateDate(a) - getCreateDate(b));

      // If we already have 2 keys, delete the oldest one
      if (sortedKeys.length >= 2) {
        const accessId = sortedKeys[0].AccessKeyId || sortedKeys[1].AccessKeyId;
        if (accessId) {
          await iam.send(
            new DeleteAccessKeyCommand({
              UserName: userName,
              AccessKeyId: accessId
            })
          );
        }
      }
    }

    const { AccessKey } = await iam.send(new CreateAccessKeyCommand({ UserName: userName }));

    return {
      accessKeyId: AccessKey?.AccessKeyId ?? "",
      secretAccessKey: AccessKey?.SecretAccessKey ?? ""
    };
  };

  const issueCredentials: TRotationFactoryIssueCredentials<TAwsIamUserSecretRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $rotateClientSecret();

    return callback(credentials);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TAwsIamUserSecretRotationGeneratedCredentials> = async (
    generatedCredentials,
    callback
  ) => {
    const { credentials, region: resolvedRegion } = await getAwsConnectionConfig(connection, region);
    const iam = new IAMClient({ credentials, region: resolvedRegion });

    await Promise.all(
      generatedCredentials.map((generatedCredential) =>
        iam.send(
          new DeleteAccessKeyCommand({
            UserName: userName,
            AccessKeyId: generatedCredential.accessKeyId
          })
        )
      )
    );

    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<TAwsIamUserSecretRotationGeneratedCredentials> = async (
    _,
    callback
  ) => {
    const credentials = await $rotateClientSecret();

    return callback(credentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TAwsIamUserSecretRotationGeneratedCredentials> = (
    generatedCredentials
  ) => {
    const secrets = [
      {
        key: secretsMapping.accessKeyId,
        value: generatedCredentials.accessKeyId
      },
      {
        key: secretsMapping.secretAccessKey,
        value: generatedCredentials.secretAccessKey
      }
    ];

    return secrets;
  };

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload
  };
};
