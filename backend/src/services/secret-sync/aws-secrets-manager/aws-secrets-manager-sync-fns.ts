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

import { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import { isAwsError } from "@app/lib/aws/error";
import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { crypto } from "@app/lib/crypto";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { AwsSecretsManagerSyncMappingBehavior } from "@app/services/secret-sync/aws-secrets-manager/aws-secrets-manager-sync-enums";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema, preservesFolderStructure } from "@app/services/secret-sync/secret-sync-fns";
import { getKeyWithSchema, TSecretSyncPayload } from "@app/services/secret-sync/secret-sync-payload";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TAwsSecretsManagerSyncWithCredentials } from "./aws-secrets-manager-sync-types";

type TAwsSecretsRecord = Record<string, SecretListEntry>;
type TAwsSecretValuesRecord = Record<string, SecretValueEntry>;
type TAwsSecretDescriptionsRecord = Record<string, DescribeSecretResponse>;

const MAX_RETRIES = 10;
const MAX_SECRET_NAME_LENGTH = 512;
const BATCH_SIZE = 20;

const getSecretsManagerClient = async (
  secretSync: TAwsSecretsManagerSyncWithCredentials,
  instanceConfigService: TInstanceConfigService
) => {
  const { destinationConfig, connection } = secretSync;

  const config = await getAwsConnectionConfig(connection, instanceConfigService, destinationConfig.region);

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

// Secrets Manager has no folders, so a mirrored name below the source folder starts with "/", as a
// Parameter Store name does: "DB_URL" in the source folder, "/api/DB_URL" below it. A secret in the
// source folder keeps the name it has without the option, so turning the option on doesn't rename it.
const getMirroredSecretMap = (payload: TSecretSyncPayload): TSecretMap =>
  Object.fromEntries(
    Object.entries(payload.mirror()).map(([key, secret]) => [key.includes("/") ? `/${key}` : key, secret])
  );

// Folders add to a mirrored name, and they can be nested after the sync is saved, so check every name
// before writing any rather than failing partway. An empty value is never written, so it can't be too long.
const assertWithinNameLengthLimit = (secretMap: TSecretMap) => {
  const tooLong = Object.entries(secretMap).find(
    ([name, { value }]) => value && name.length > MAX_SECRET_NAME_LENGTH
  )?.[0];

  if (tooLong) {
    const shown = tooLong.length > 200 ? `${tooLong.slice(0, 80)}...${tooLong.slice(-80)}` : tooLong;

    throw new SecretSyncError({
      message: `"${shown}" is ${tooLong.length} characters long, more than the ${MAX_SECRET_NAME_LENGTH} AWS Secrets Manager allows. Shorten the secret's folder names, move it to a shallower folder, or turn off preserving folder structure.`,
      shouldRetry: false
    });
  }
};

// With folders mirrored, a name is the sync's only if it's shaped like one getMirroredSecretMap
// builds, so another sync's "team-a/DB_URL" or a bare "/DB_URL" is left alone.
const isSyncedSecretName = (name: string, environment: string, keySchema?: string, mirroredFolders?: Set<string>) => {
  if (!mirroredFolders) return matchesSchema(name, environment, keySchema);

  const key = name.startsWith("/") ? name.substring(1) : name;
  if (name.startsWith("/") !== key.includes("/")) return false;

  return matchesSchema(key, environment, keySchema, { mirroredFolders });
};

const getSecretsRecord = async (
  client: SecretsManagerClient,
  environment: string,
  keySchema?: string,
  mirroredFolders?: Set<string>,
  secretMap?: TSecretMap
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
          // A name the sync writes is always its own. isSyncedSecretName alone can miss one: a stored
          // key containing "/" adds folders to its mirrored name, and the key schema is checked
          // against the last segment only.
          if (
            secretEntry.Name &&
            ((secretMap && Object.hasOwn(secretMap, secretEntry.Name)) ||
              isSyncedSecretName(secretEntry.Name, environment, keySchema, mirroredFolders))
          ) {
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
    payload: TSecretSyncPayload,
    instanceConfigService: TInstanceConfigService
  ) => {
    const { destinationConfig, syncOptions, environment } = secretSync;
    const preserveFolderStructure = preservesFolderStructure(secretSync);

    const secretMap = preserveFolderStructure ? getMirroredSecretMap(payload) : payload.flatten();
    const mirroredFolders = preserveFolderStructure ? payload.mirroredFolders() : undefined;

    if (preserveFolderStructure) assertWithinNameLengthLimit(secretMap);

    const client = await getSecretsManagerClient(secretSync, instanceConfigService);

    const syncTagsRecord = Object.fromEntries(syncOptions.tags?.map((tag) => [tag.key, tag.value]) ?? []);

    const keyId = syncOptions.keyId ?? "alias/aws/secretsmanager";

    const createdSecretKeys: string[] = [];
    const updatedSecretKeys: string[] = [];
    const deletedSecretKeys: string[] = [];

    if (destinationConfig.mappingBehavior === AwsSecretsManagerSyncMappingBehavior.OneToOne) {
      const awsSecretsRecord = await getSecretsRecord(
        client,
        environment?.slug || "",
        syncOptions.keySchema,
        mirroredFolders,
        secretMap
      );

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
        if (!isSyncedSecretName(secretKey, environment?.slug || "", syncOptions.keySchema, mirroredFolders)) continue;

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

      // Every secret goes into this one AWS secret's JSON body under its own (unprefixed) key, so
      // the body needs the raw-key map rather than the schema-applied one.
      const unmodifiedSecretMap = payload.flatten({ disableKeySchema: true });

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
          awsTagsRecord: Object.fromEntries(existingDescription?.Tags?.map((tag) => [tag.Key!, tag.Value!]) ?? [])
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
  getSecrets: async (
    secretSync: TAwsSecretsManagerSyncWithCredentials,
    instanceConfigService: TInstanceConfigService
  ): Promise<TSecretMap> => {
    const client = await getSecretsManagerClient(secretSync, instanceConfigService);

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
  removeSecrets: async (
    secretSync: TAwsSecretsManagerSyncWithCredentials,
    payload: TSecretSyncPayload,
    instanceConfigService: TInstanceConfigService
  ) => {
    const { destinationConfig, syncOptions, environment } = secretSync;
    const preserveFolderStructure = preservesFolderStructure(secretSync);

    const secretMap = preserveFolderStructure ? getMirroredSecretMap(payload) : payload.flatten();
    const mirroredFolders = preserveFolderStructure ? payload.mirroredFolders() : undefined;

    const client = await getSecretsManagerClient(secretSync, instanceConfigService);

    if (destinationConfig.mappingBehavior === AwsSecretsManagerSyncMappingBehavior.OneToOne) {
      const awsSecretsRecord = await getSecretsRecord(
        client,
        environment?.slug || "",
        syncOptions.keySchema,
        mirroredFolders,
        secretMap
      );

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
