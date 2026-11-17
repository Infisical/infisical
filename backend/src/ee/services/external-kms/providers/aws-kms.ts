import { CreateKeyCommand, DecryptCommand, DescribeKeyCommand, EncryptCommand, KMSClient } from "@aws-sdk/client-kms";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { Knex } from "knex";
import { z } from "zod";

import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { deterministicStringify } from "@app/lib/fn/object";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import {
  ExternalKmsAwsSchema,
  ExternalKmsProviderInputsVersion,
  KmsAwsCredentialType,
  TExternalKmsAwsSchema,
  TExternalKmsProviderFns
} from "./model";

type TInfisicalIdLookupDeps = {
  orgDAL: Pick<TOrgDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findByIdIncludingExpired">;
  tx?: Knex;
};

const PROJECT_ID_MAX_LENGTH = 36;

const isOrgId = (externalId: string, orgId: string) => externalId.toLowerCase() === orgId.toLowerCase();

export const bindAwsKmsExternalIdToOrg = ({
  inputs,
  orgId
}: {
  inputs: TExternalKmsAwsSchema;
  orgId: string;
}): TExternalKmsAwsSchema => {
  if (inputs.credential.type !== KmsAwsCredentialType.AssumeRole) return inputs;

  const { externalId } = inputs.credential.data;
  if (!externalId || isOrgId(externalId, orgId)) {
    return {
      ...inputs,
      credential: { ...inputs.credential, data: { ...inputs.credential.data, externalId: orgId } }
    };
  }

  throw new BadRequestError({
    message: `The AWS external ID must be your organization ID (${orgId}). Set the sts:ExternalId condition in the IAM role's trust policy to your organization ID and use the same value here.`
  });
};

// Legacy rows keep their stored external ID, except one that names another organization or one of its
// projects: no customer sets that up for themselves, and it is what a cross-organization takeover stores.
// Projects carried over from MongoDB kept 24-character IDs, so every value that fits projects.id is looked
// up as a project, and one pending deletion still counts because its role can still trust its ID. Only a
// UUID can name an organization, and organizations.id is a uuid column that rejects anything else.
export const assertAwsKmsLegacyExternalIdNotForeign = async ({
  inputs,
  orgId,
  orgDAL,
  projectDAL,
  tx
}: TInfisicalIdLookupDeps & { inputs: TExternalKmsAwsSchema; orgId: string }) => {
  if (inputs.credential.type !== KmsAwsCredentialType.AssumeRole) return;

  const { externalId } = inputs.credential.data;
  if (!externalId || isOrgId(externalId, orgId) || externalId.length > PROJECT_ID_MAX_LENGTH) return;

  const [org, project] = await Promise.all([
    z.string().uuid().safeParse(externalId).success ? orgDAL.findById(externalId, tx) : undefined,
    projectDAL.findByIdIncludingExpired(externalId, tx)
  ]);
  if (!org && (!project || project.orgId === orgId)) return;

  throw new BadRequestError({
    message: `This AWS external KMS sends an external ID that belongs to another Infisical organization or one of its projects. Update its credentials to use your organization ID (${orgId}), and require the same value in the IAM role's trust policy.`
  });
};

export const hasLegacyAwsKmsExternalId = ({
  inputs,
  inputsVersion,
  orgId
}: {
  inputs: TExternalKmsAwsSchema;
  inputsVersion: number;
  orgId: string;
}) => {
  if (inputsVersion !== ExternalKmsProviderInputsVersion.Legacy) return false;
  if (inputs.credential.type !== KmsAwsCredentialType.AssumeRole) return false;

  const { externalId } = inputs.credential.data;
  return !externalId || !isOrgId(externalId, orgId);
};

// A legacy row keeps its stored external ID only while its credential is unchanged. Any change, such as a
// new role ARN, moves it to the current rules, or a legacy value could be pointed at another role.
export const resolveAwsKmsInputsVersion = ({
  currentVersion,
  storedInputs,
  updatedInputs
}: {
  currentVersion: number;
  storedInputs: TExternalKmsAwsSchema;
  updatedInputs: TExternalKmsAwsSchema;
}) => {
  if (
    currentVersion === ExternalKmsProviderInputsVersion.Legacy &&
    deterministicStringify(storedInputs.credential) === deterministicStringify(updatedInputs.credential)
  ) {
    return ExternalKmsProviderInputsVersion.Legacy;
  }
  return ExternalKmsProviderInputsVersion.OrgBoundExternalId;
};

const getAwsKmsClient = async (providerInputs: TExternalKmsAwsSchema) => {
  if (providerInputs.credential.type === KmsAwsCredentialType.AssumeRole) {
    const awsCredential = providerInputs.credential.data;
    const stsClient = new STSClient({
      region: providerInputs.awsRegion,
      useFipsEndpoint: crypto.isFipsModeEnabled(),
      sha256: CustomAWSHasher
    });
    const command = new AssumeRoleCommand({
      RoleArn: awsCredential.assumeRoleArn,
      RoleSessionName: `infisical-kms-${crypto.nativeCrypto.randomUUID()}`,
      DurationSeconds: 900, // 15mins
      ExternalId: awsCredential.externalId
    });
    const response = await stsClient.send(command);
    if (!response.Credentials?.AccessKeyId || !response.Credentials?.SecretAccessKey)
      throw new BadRequestError({ message: "Failed to assume role" });

    const kmsClient = new KMSClient({
      region: providerInputs.awsRegion,
      useFipsEndpoint: crypto.isFipsModeEnabled(),
      sha256: CustomAWSHasher,
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
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    sha256: CustomAWSHasher,
    credentials: {
      accessKeyId: awsCredential.accessKey,
      secretAccessKey: awsCredential.secretKey
    }
  });
  return kmsClient;
};

type AwsKmsProviderArgs = TInfisicalIdLookupDeps & {
  inputs: unknown;
  inputsVersion: number;
  orgId: string;
};
type TAwsKmsProviderFactoryReturn = TExternalKmsProviderFns & {
  generateInputKmsKey: () => Promise<TExternalKmsAwsSchema>;
  getProviderInputs: () => TExternalKmsAwsSchema;
};

export const AwsKmsProviderFactory = async ({
  inputs,
  inputsVersion,
  orgId,
  orgDAL,
  projectDAL,
  tx
}: AwsKmsProviderArgs): Promise<TAwsKmsProviderFactoryReturn> => {
  const parsedInputs = await ExternalKmsAwsSchema.parseAsync(inputs);
  if (inputsVersion === ExternalKmsProviderInputsVersion.Legacy) {
    await assertAwsKmsLegacyExternalIdNotForeign({ inputs: parsedInputs, orgId, orgDAL, projectDAL, tx });
  }
  let providerInputs =
    inputsVersion === ExternalKmsProviderInputsVersion.Legacy
      ? parsedInputs
      : bindAwsKmsExternalIdToOrg({ inputs: parsedInputs, orgId });
  let awsClient = await getAwsKmsClient(providerInputs);

  const generateInputKmsKey = async () => {
    if (providerInputs.kmsKeyId) return providerInputs;

    const command = new CreateKeyCommand({ Tags: [{ TagKey: "author", TagValue: "infisical" }] });
    const kmsKey = await awsClient.send(command);

    if (!kmsKey.KeyMetadata?.KeyId) throw new BadRequestError({ message: "Failed to generate kms key" });

    const updatedProviderInputs = await ExternalKmsAwsSchema.parseAsync({
      ...providerInputs,
      kmsKeyId: kmsKey.KeyMetadata?.KeyId
    });

    providerInputs = updatedProviderInputs;
    awsClient = await getAwsKmsClient(providerInputs);

    return updatedProviderInputs;
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

  const cleanup = async () => {
    try {
      awsClient.destroy();
    } catch (error) {
      throw new Error("Failed to cleanup AWS KMS client", { cause: error });
    }
  };

  return {
    generateInputKmsKey,
    getProviderInputs: () => providerInputs,
    validateConnection,
    encrypt,
    decrypt,
    cleanup
  };
};
