import { CreateKeyCommand, DecryptCommand, DescribeKeyCommand, EncryptCommand, KMSClient } from "@aws-sdk/client-kms";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { randomUUID } from "crypto";

import { ExternalKmsAwsSchema, KmsAwsCredentialType, TExternalKmsAwsSchema, TExternalKmsProviderFns } from "./model";

const getAwsKmsClient = async (providerInputs: TExternalKmsAwsSchema) => {
  if (providerInputs.credential.type === KmsAwsCredentialType.AssumeRole) {
    const awsCredential = providerInputs.credential.data;
    const stsClient = new STSClient({
      region: providerInputs.awsRegion
    });
    const command = new AssumeRoleCommand({
      RoleArn: awsCredential.assumeRoleArn,
      RoleSessionName: `infisical-kms-${randomUUID()}`,
      DurationSeconds: 900, // 15mins
      ExternalId: awsCredential.externalId
    });
    const response = await stsClient.send(command);
    if (!response.Credentials?.AccessKeyId || !response.Credentials?.SecretAccessKey)
      throw new Error("Failed to assume role");

    const kmsClient = new KMSClient({
      region: providerInputs.awsRegion,
      credentials: {
        accessKeyId: response.Credentials.AccessKeyId,
        secretAccessKey: response.Credentials.SecretAccessKey,
        sessionToken: response.Credentials.SessionToken,
        expiration: response.Credentials.Expiration
      }
    });
    return kmsClient;
  }
  const awsCredential = providerInputs.credential.data;
  const kmsClient = new KMSClient({
    region: providerInputs.awsRegion,
    credentials: {
      accessKeyId: awsCredential.accessKey,
      secretAccessKey: awsCredential.secretKey
    }
  });
  return kmsClient;
};

type AwsKmsProviderArgs = {
  inputs: unknown;
};
type TAwsKmsProviderFactoryReturn = TExternalKmsProviderFns & {
  generateInputKmsKey: () => Promise<TExternalKmsAwsSchema>;
};

export const AwsKmsProviderFactory = async ({ inputs }: AwsKmsProviderArgs): Promise<TAwsKmsProviderFactoryReturn> => {
  const providerInputs = await ExternalKmsAwsSchema.parseAsync(inputs);
  const awsClient = await getAwsKmsClient(providerInputs);

  const generateInputKmsKey = async () => {
    if (providerInputs.kmsKeyId) return providerInputs;

    const command = new CreateKeyCommand({ Tags: [{ TagKey: "author", TagValue: "infisical" }] });
    const kmsKey = await awsClient.send(command);
    if (!kmsKey.KeyMetadata?.KeyId) throw new Error("Failed to generate kms key");

    return { ...providerInputs, kmsKeyId: kmsKey.KeyMetadata?.KeyId };
  };

  const validateConnection = async () => {
    const command = new DescribeKeyCommand({
      KeyId: providerInputs.kmsKeyId
    });
    const isConnected = await awsClient.send(command).then(() => true);
    return isConnected;
  };

  const encrypt = async (data: Buffer) => {
    const command = new EncryptCommand({
      KeyId: providerInputs.kmsKeyId,
      Plaintext: data
    });
    const encryptionCommand = await awsClient.send(command);
    if (!encryptionCommand.CiphertextBlob) throw new Error("encryption failed");

    return { encryptedBlob: Buffer.from(encryptionCommand.CiphertextBlob) };
  };

  const decrypt = async (encryptedBlob: Buffer) => {
    const command = new DecryptCommand({
      KeyId: providerInputs.kmsKeyId,
      CiphertextBlob: encryptedBlob
    });
    const decryptionCommand = await awsClient.send(command);
    if (!decryptionCommand.Plaintext) throw new Error("decryption failed");

    return { data: Buffer.from(decryptionCommand.Plaintext) };
  };

  return {
    generateInputKmsKey,
    validateConnection,
    encrypt,
    decrypt
  };
};
