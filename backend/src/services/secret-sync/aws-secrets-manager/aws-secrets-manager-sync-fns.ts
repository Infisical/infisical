import {
  BatchGetSecretValueCommand,
  CreateSecretCommand,
  type CreateSecretCommandInput,
  type CreateSecretResponse,
  DeleteSecretCommand,
  type DeleteSecretResponse,
  DescribeSecretCommand,
  type DescribeSecretCommandInput,
  type DescribeSecretResponse,
  GetSecretValueCommand,
  ListSecretsCommand,
  type SecretListEntry,
  SecretsManagerClient,
  type SecretValueEntry,
  type Tag,
  TagResourceCommand,
  type TagResourceCommandOutput,
  UntagResourceCommand,
  type UntagResourceCommandOutput,
  UpdateSecretCommand,
  type UpdateSecretCommandInput
} from "@aws-sdk/client-secrets-manager";

import { isAwsError } from "@app/lib/aws/error";
import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { crypto } from "@app/lib/crypto";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { AwsSecretsManagerSyncMappingBehavior } from "@app/services/secret-sync/aws-secrets-manager/aws-secrets-manager-sync-enums";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { getKeyWithSchema, matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TAwsSecretsManagerSyncWithCredentials } from "./aws-secrets-manager-sync-types";

type TAwsSecretsRecord = Record<string, SecretListEntry>;
type TAwsSecretValuesRecord = Record<string, SecretValueEntry>;
type TAwsSecretDescriptionsRecord = Record<string, DescribeSecretResponse>;

const MAX_RETRIES = 10;
const BATCH_SIZE = 20;

const getSecretsManagerClient = async (secretSync: TAwsSecretsManagerSyncWithCredentials) => {
  const { destinationConfig, connection } = secretSync;

  const config = await getAwsConnectionConfig(connection, destinationConfig.region);

  const secretsManagerClient = new SecretsManagerClient({
    region: config.region,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    sha256: CustomAWSHasher,
    credentials: config.credentials
  });

  return secretsManagerClient;
};

const sleep = async () =>
  new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });

const getSecretsRecord = async (
  client: SecretsManagerClient,
  environment: string,
  keySchema?: string
): Promise<TAwsSecretsRecord> => {
  const awsSecretsRecord: TAwsSecretsRecord = {};
  let hasNext = true;
  let nextToken: string | undefined;
  let attempt = 0;

  while (hasNext) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const output = await client.send(new ListSecretsCommand({ NextToken: nextToken }));

      attempt = 0;

      if (output.SecretList) {
        output.SecretList.forEach((secretEntry) => {
          if (secretEntry.Name && matchesSchema(secretEntry.Name, environment, keySchema)) {
            awsSecretsRecord[secretEntry.Name] = secretEntry;
          }
        });
      }

      hasNext = Boolean(output.NextToken);
      nextToken = output.NextToken;
    } catch (e) {
      if (isAwsError(e, "ThrottlingException") && attempt < MAX_RETRIES) {
        attempt += 1;
        // eslint-disable-next-line no-await-in-loop
        await sleep();
        // eslint-disable-next-line no-continue
        continue;
      }

      throw e;
    }
  }

  return awsSecretsRecord;
};

const getSecretValuesRecord = async (
  client: SecretsManagerClient,
  awsSecretsRecord: TAwsSecretsRecord
): Promise<TAwsSecretValuesRecord> => {
  const awsSecretValuesRecord: TAwsSecretValuesRecord = {};
  let attempt = 0;

  const secretIdList = Object.keys(awsSecretsRecord);

  for (let i = 0; i < secretIdList.length; i += BATCH_SIZE) {
    const batchSecretIds = secretIdList.slice(i, i + BATCH_SIZE);
    let hasNext = true;
    let nextToken: string | undefined;

    while (hasNext) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const output = await client.send(
          new BatchGetSecretValueCommand({
            SecretIdList: batchSecretIds,
            NextToken: nextToken
          })
        );

        attempt = 0;

        if (output.SecretValues) {
          output.SecretValues.forEach((secretValueEntry) => {
            if (secretValueEntry.Name) {
              awsSecretValuesRecord[secretValueEntry.Name] = secretValueEntry;
            }
          });
        }

        hasNext = Boolean(output.NextToken);
        nextToken = output.NextToken;
      } catch (e) {
        if (isAwsError(e, "ThrottlingException") && attempt < MAX_RETRIES) {
          attempt += 1;
          // eslint-disable-next-line no-await-in-loop
          await sleep();
          // eslint-disable-next-line no-continue
          continue;
        }

        throw e;
      }
    }
  }

  return awsSecretValuesRecord;
};

const describeSecret = async (
  client: SecretsManagerClient,
  input: DescribeSecretCommandInput,
  attempt = 0
): Promise<DescribeSecretResponse> => {
  try {
    return await client.send(new DescribeSecretCommand(input));
  } catch (error) {
    if (isAwsError(error, "ThrottlingException") && attempt < MAX_RETRIES) {
      await sleep();

      // retry
      return describeSecret(client, input, attempt + 1);
    }
    throw error;
  }
};

const getSecretDescriptionsRecord = async (
  client: SecretsManagerClient,
  awsSecretsRecord: TAwsSecretsRecord
): Promise<TAwsSecretDescriptionsRecord> => {
  const awsSecretDescriptionsRecord: TAwsSecretValuesRecord = {};

  for await (const secretKey of Object.keys(awsSecretsRecord)) {
    try {
      awsSecretDescriptionsRecord[secretKey] = await describeSecret(client, {
        SecretId: secretKey
      });
    } catch (error) {
      throw new SecretSyncError({
        secretKey,
        error
      });
    }
  }

  return awsSecretDescriptionsRecord;
};

const createSecret = async (
  client: SecretsManagerClient,
  input: CreateSecretCommandInput,
  attempt = 0
): Promise<CreateSecretResponse> => {
  try {
    return await client.send(new CreateSecretCommand(input));
  } catch (error) {
    if (isAwsError(error, "ThrottlingException") && attempt < MAX_RETRIES) {
      await sleep();

      // retry
      return createSecret(client, input, attempt + 1);
    }
    throw error;
  }
};

const updateSecret = async (
  client: SecretsManagerClient,
  input: UpdateSecretCommandInput,
  attempt = 0
): Promise<CreateSecretResponse> => {
  try {
    return await client.send(new UpdateSecretCommand(input));
  } catch (error) {
    if (isAwsError(error, "ThrottlingException") && attempt < MAX_RETRIES) {
      await sleep();

      // retry
      return updateSecret(client, input, attempt + 1);
    }
    throw error;
  }
};

const deleteSecret = async (
  client: SecretsManagerClient,
  secretKey: string,
  attempt = 0
): Promise<DeleteSecretResponse> => {
  try {
    return await client.send(new DeleteSecretCommand({ SecretId: secretKey, ForceDeleteWithoutRecovery: true }));
  } catch (error) {
    if (isAwsError(error, "ThrottlingException") && attempt < MAX_RETRIES) {
      await sleep();

      // retry
      return deleteSecret(client, secretKey, attempt + 1);
    }
    throw error;
  }
};

const addTags = async (
  client: SecretsManagerClient,
  secretKey: string,
  tags: Tag[],
  attempt = 0
): Promise<TagResourceCommandOutput> => {
  try {
    return await client.send(new TagResourceCommand({ SecretId: secretKey, Tags: tags }));
  } catch (error) {
    if (isAwsError(error, "ThrottlingException") && attempt < MAX_RETRIES) {
      await sleep();

      // retry
      return addTags(client, secretKey, tags, attempt + 1);
    }
    throw error;
  }
};

const removeTags = async (
  client: SecretsManagerClient,
  secretKey: string,
  tagKeys: string[],
  attempt = 0
): Promise<UntagResourceCommandOutput> => {
  try {
    return await client.send(new UntagResourceCommand({ SecretId: secretKey, TagKeys: tagKeys }));
  } catch (error) {
    if (isAwsError(error, "ThrottlingException") && attempt < MAX_RETRIES) {
      await sleep();

      // retry
      return removeTags(client, secretKey, tagKeys, attempt + 1);
    }
    throw error;
  }
};

const processTags = ({
  syncTagsRecord,
  awsTagsRecord
}: {
  syncTagsRecord: Record<string, string>;
  awsTagsRecord: Record<string, string>;
}) => {
  const tagsToAdd: Tag[] = [];
  const tagKeysToRemove: string[] = [];

  for (const syncEntry of Object.entries(syncTagsRecord)) {
    const [syncKey, syncValue] = syncEntry;

    if (!(syncKey in awsTagsRecord) || syncValue !== awsTagsRecord[syncKey])
      tagsToAdd.push({ Key: syncKey, Value: syncValue });
  }

  for (const awsKey of Object.keys(awsTagsRecord)) {
    if (!(awsKey in syncTagsRecord)) tagKeysToRemove.push(awsKey);
  }

  return { tagsToAdd, tagKeysToRemove };
};

const describeSecretIfExists = async (
  client: SecretsManagerClient,
  secretId: string,
  attempt = 0
): Promise<DescribeSecretResponse | null> => {
  try {
    return await client.send(new DescribeSecretCommand({ SecretId: secretId }));
  } catch (e) {
    if (isAwsError(e, "ResourceNotFoundException")) {
      return null;
    }

    if (isAwsError(e, "ThrottlingException") && attempt < MAX_RETRIES) {
      await sleep();
      return describeSecretIfExists(client, secretId, attempt + 1);
    }

    throw e;
  }
};

const getSingleSecretValue = async (
  client: SecretsManagerClient,
  secretId: string,
  attempt = 0
): Promise<SecretValueEntry | null> => {
  try {
    return await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  } catch (e) {
    if (isAwsError(e, "ResourceNotFoundException")) {
      return null;
    }

    if (isAwsError(e, "ThrottlingException") && attempt < MAX_RETRIES) {
      await sleep();
      return getSingleSecretValue(client, secretId, attempt + 1);
    }

    throw e;
  }
};

export const AwsSecretsManagerSyncFns = {
  syncSecrets: async (
    secretSync: TAwsSecretsManagerSyncWithCredentials,
    secretMap: TSecretMap,
    unmodifiedSecretMap: TSecretMap // ie not schematized
  ) => {
    const { destinationConfig, syncOptions, environment } = secretSync;

    const client = await getSecretsManagerClient(secretSync);

    const syncTagsRecord = Object.fromEntries(syncOptions.tags?.map((tag) => [tag.key, tag.value]) ?? []);

    const keyId = syncOptions.keyId ?? "alias/aws/secretsmanager";

    const createdSecretKeys: string[] = [];
    const updatedSecretKeys: string[] = [];
    const deletedSecretKeys: string[] = [];

    if (destinationConfig.mappingBehavior === AwsSecretsManagerSyncMappingBehavior.OneToOne) {
      const awsSecretsRecord = await getSecretsRecord(client, environment?.slug || "", syncOptions.keySchema);

      const awsValuesRecord = await getSecretValuesRecord(client, awsSecretsRecord);

      const awsDescriptionsRecord = await getSecretDescriptionsRecord(client, awsSecretsRecord);
      for await (const entry of Object.entries(secretMap)) {
        const [key, { value, secretMetadata }] = entry;

        // skip secrets that don't have a value set
        if (!value) {
          // eslint-disable-next-line no-continue
          continue;
        }

        if (awsSecretsRecord[key]) {
          // skip secrets that haven't changed
          if (awsValuesRecord[key]?.SecretString !== value || keyId !== awsDescriptionsRecord[key]?.KmsKeyId) {
            try {
              await updateSecret(client, {
                SecretId: key,
                SecretString: value,
                KmsKeyId: keyId
              });
              updatedSecretKeys.push(key);
            } catch (error) {
              throw new SecretSyncError({
                error,
                secretKey: key
              });
            }
          }
        } else {
          try {
            await createSecret(client, {
              Name: key,
              SecretString: value,
              KmsKeyId: keyId
            });
            createdSecretKeys.push(key);
          } catch (error) {
            throw new SecretSyncError({
              error,
              secretKey: key
            });
          }
        }

        if (syncOptions.tags !== undefined || syncOptions.syncSecretMetadataAsTags) {
          const { tagsToAdd, tagKeysToRemove } = processTags({
            syncTagsRecord: {
              // configured sync tags take preference over secret metadata
              ...(syncOptions.syncSecretMetadataAsTags &&
                Object.fromEntries(secretMetadata?.map((tag) => [tag.key, tag.value]) ?? [])),
              ...(syncOptions.tags !== undefined && syncTagsRecord)
            },
            awsTagsRecord: Object.fromEntries(
              awsDescriptionsRecord[key]?.Tags?.map((tag) => [tag.Key!, tag.Value!]) ?? []
            )
          });

          if (tagsToAdd.length) {
            try {
              await addTags(client, key, tagsToAdd);
            } catch (error) {
              throw new SecretSyncError({
                error,
                secretKey: key
              });
            }
          }

          if (tagKeysToRemove.length) {
            try {
              await removeTags(client, key, tagKeysToRemove);
            } catch (error) {
              throw new SecretSyncError({
                error,
                secretKey: key
              });
            }
          }
        }
      }

      if (syncOptions.disableSecretDeletion) return { createdSecretKeys, updatedSecretKeys, deletedSecretKeys };

      for await (const secretKey of Object.keys(awsSecretsRecord)) {
        // eslint-disable-next-line no-continue
        if (!matchesSchema(secretKey, environment?.slug || "", syncOptions.keySchema)) continue;

        if (!(secretKey in secretMap) || !secretMap[secretKey].value) {
          try {
            await deleteSecret(client, secretKey);
            deletedSecretKeys.push(secretKey);
          } catch (error) {
            throw new SecretSyncError({
              error,
              secretKey
            });
          }
        }
      }
    } else {
      // Many-To-One Mapping: only fetch the single target secret instead of listing all secrets

      const secretValue = JSON.stringify(
        Object.fromEntries(Object.entries(unmodifiedSecretMap).map(([key, secretData]) => [key, secretData.value]))
      );

      const secretName = getKeyWithSchema({
        key: destinationConfig.secretName,
        environment: environment!.slug, // wouldn't be sync if undefined
        schema: syncOptions.keySchema
      });

      const existingDescription = await describeSecretIfExists(client, secretName);
      const secretExists = existingDescription !== null;

      let existingSecretValue: SecretValueEntry | null = null;
      if (secretExists) {
        existingSecretValue = await getSingleSecretValue(client, secretName);
      }

      const hasValueChanged = existingSecretValue?.SecretString !== secretValue;
      const hasKmsKeyChanged = keyId !== existingDescription?.KmsKeyId;

      if (secretExists && (hasValueChanged || hasKmsKeyChanged)) {
        await updateSecret(client, {
          SecretId: secretName,
          SecretString: secretValue,
          KmsKeyId: keyId
        });
        updatedSecretKeys.push(secretName);
      } else if (!secretExists) {
        await createSecret(client, {
          Name: secretName,
          SecretString: secretValue,
          KmsKeyId: keyId
        });
        createdSecretKeys.push(secretName);
      }

      if (syncOptions.tags !== undefined) {
        const { tagsToAdd, tagKeysToRemove } = processTags({
          syncTagsRecord,
          awsTagsRecord: Object.fromEntries(
            existingDescription?.Tags?.map((tag) => [tag.Key!, tag.Value!]) ?? []
          )
        });

        if (tagsToAdd.length) {
          try {
            await addTags(client, secretName, tagsToAdd);
          } catch (error) {
            throw new SecretSyncError({
              error,
              secretKey: secretName
            });
          }
        }

        if (tagKeysToRemove.length) {
          try {
            await removeTags(client, secretName, tagKeysToRemove);
          } catch (error) {
            throw new SecretSyncError({
              error,
              secretKey: secretName
            });
          }
        }
      }
    }

    return { createdSecretKeys, updatedSecretKeys, deletedSecretKeys };
  },
  getSecrets: async (secretSync: TAwsSecretsManagerSyncWithCredentials): Promise<TSecretMap> => {
    const client = await getSecretsManagerClient(secretSync);

    const { destinationConfig, environment, syncOptions } = secretSync;

    if (destinationConfig.mappingBehavior === AwsSecretsManagerSyncMappingBehavior.OneToOne) {
      const awsSecretsRecord = await getSecretsRecord(client, environment?.slug || "", syncOptions.keySchema);
      const awsValuesRecord = await getSecretValuesRecord(client, awsSecretsRecord);

      return Object.fromEntries(
        Object.keys(awsSecretsRecord)
          .filter((key) => Object.hasOwn(awsValuesRecord, key))
          .map((key) => [key, { value: awsValuesRecord[key]?.SecretString ?? "" }])
      );
    }

    // Many-To-One Mapping: fetch only the single target secret

    const secretName = getKeyWithSchema({
      key: destinationConfig.secretName,
      environment: environment!.slug, // wouldn't be sync if undefined
      schema: syncOptions.keySchema
    });

    const secretValueEntry = await getSingleSecretValue(client, secretName);

    if (!secretValueEntry) return {};

    try {
      const parsedValue = (secretValueEntry.SecretString ? JSON.parse(secretValueEntry.SecretString) : {}) as Record<
        string,
        string
      >;

      return Object.fromEntries(Object.entries(parsedValue).map(([key, value]) => [key, { value }]));
    } catch {
      throw new SecretSyncError({
        message:
          "Failed to import secrets. Invalid format for Many-To-One mapping behavior: requires key/value configuration.",
        shouldRetry: false
      });
    }
  },
  removeSecrets: async (secretSync: TAwsSecretsManagerSyncWithCredentials, secretMap: TSecretMap) => {
    const { destinationConfig, syncOptions, environment } = secretSync;

    const client = await getSecretsManagerClient(secretSync);

    if (destinationConfig.mappingBehavior === AwsSecretsManagerSyncMappingBehavior.OneToOne) {
      const awsSecretsRecord = await getSecretsRecord(client, environment?.slug || "", syncOptions.keySchema);

      for await (const secretKey of Object.keys(awsSecretsRecord)) {
        if (secretKey in secretMap) {
          try {
            await deleteSecret(client, secretKey);
          } catch (error) {
            throw new SecretSyncError({
              error,
              secretKey
            });
          }
        }
      }
    } else {
      const secretName = getKeyWithSchema({
        key: destinationConfig.secretName,
        environment: environment!.slug, // wouldn't be sync if undefined
        schema: syncOptions.keySchema
      });

      await deleteSecret(client, secretName);
    }
  }
};
