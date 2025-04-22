import AWS from "aws-sdk";

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

export const awsIamUserSecretRotationFactory: TRotationFactory<
  TAwsIamUserSecretRotationWithConnection,
  TAwsIamUserSecretRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    parameters: { region, clientName },
    connection,
    secretsMapping
  } = secretRotation;

  const $rotateClientSecret = async () => {
    const { credentials } = await getAwsConnectionConfig(connection, region);
    const iam = new AWS.IAM({ credentials });

    const { AccessKeyMetadata } = await iam.listAccessKeys({ UserName: clientName }).promise();

    if (AccessKeyMetadata && AccessKeyMetadata.length > 0) {
      for (const key of AccessKeyMetadata) {
        if (key.Status === "Inactive" && key.AccessKeyId) {
          // eslint-disable-next-line no-await-in-loop
          await iam
            .deleteAccessKey({
              UserName: clientName,
              AccessKeyId: key.AccessKeyId
            })
            .promise();
        }
      }

      const activeKey = AccessKeyMetadata.find((k) => k.Status === "Active");
      if (activeKey && activeKey.AccessKeyId) {
        await iam
          .updateAccessKey({
            UserName: clientName,
            AccessKeyId: activeKey.AccessKeyId,
            Status: "Inactive"
          })
          .promise();
      }
    }

    const { AccessKey } = await iam.createAccessKey({ UserName: clientName }).promise();

    return {
      accessKeyId: AccessKey.AccessKeyId,
      secretAccessKey: AccessKey.SecretAccessKey
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
    const { credentials } = await getAwsConnectionConfig(connection, region);
    const iam = new AWS.IAM({ credentials });

    for (const generatedCredential of generatedCredentials) {
      // eslint-disable-next-line no-await-in-loop
      await iam
        .deleteAccessKey({
          UserName: clientName,
          AccessKeyId: generatedCredential.accessKeyId
        })
        .promise();
    }

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
