import {
  BatchGetSecretValueCommand,
  CreateSecretCommand,
  CreateSecretCommandInput,
  DeleteSecretCommand,
  DeleteSecretResponse,
  ListSecretsCommand,
  SecretsManagerClient,
  UpdateSecretCommand,
  UpdateSecretCommandInput
} from "@aws-sdk/client-secrets-manager";
import { AWSError } from "aws-sdk";
import { CreateSecretResponse, SecretListEntry, SecretValueEntry } from "aws-sdk/clients/secretsmanager";

import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { AwsSecretsManagerSyncMappingBehavior } from "@app/services/secret-sync/aws-secrets-manager/aws-secrets-manager-sync-enums";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TAwsSecretsManagerSyncWithCredentials } from "./aws-secrets-manager-sync-types";

type TAwsSecretsRecord = Record<string, SecretListEntry>;
type TAwsSecretValuesRecord = Record<string, SecretValueEntry>;

const MAX_RETRIES = 5;
const BATCH_SIZE = 20;

const getSecretsManagerClient = async (secretSync: TAwsSecretsManagerSyncWithCredentials) => {
  const { destinationConfig, connection } = secretSync;

  const config = await getAwsConnectionConfig(connection, destinationConfig.region);

  const secretsManagerClient = new SecretsManagerClient({
    region: config.region,
    credentials: config.credentials!
  });

  return secretsManagerClient;
};

const sleep = async () =>
  new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });

const getSecretsRecord = async (client: SecretsManagerClient): Promise<TAwsSecretsRecord> => {
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
          if (secretEntry.Name) {
            awsSecretsRecord[secretEntry.Name] = secretEntry;
          }
        });
      }

      hasNext = Boolean(output.NextToken);
      nextToken = output.NextToken;
    } catch (e) {
      if ((e as AWSError).code === "ThrottlingException" && attempt < MAX_RETRIES) {
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
        if ((e as AWSError).code === "ThrottlingException" && attempt < MAX_RETRIES) {
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

const createSecret = async (
  client: SecretsManagerClient,
  input: CreateSecretCommandInput,
  attempt = 0
): Promise<CreateSecretResponse> => {
  try {
    return await client.send(new CreateSecretCommand(input));
  } catch (error) {
    if ((error as AWSError).code === "ThrottlingException" && attempt < MAX_RETRIES) {
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
    if ((error as AWSError).code === "ThrottlingException" && attempt < MAX_RETRIES) {
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
    if ((error as AWSError).code === "ThrottlingException" && attempt < MAX_RETRIES) {
      await sleep();

      // retry
      return deleteSecret(client, secretKey, attempt + 1);
    }
    throw error;
  }
};

export const AwsSecretsManagerSyncFns = {
  syncSecrets: async (secretSync: TAwsSecretsManagerSyncWithCredentials, secretMap: TSecretMap) => {
    const { destinationConfig } = secretSync;

    const client = await getSecretsManagerClient(secretSync);

    const awsSecretsRecord = await getSecretsRecord(client);

    const awsValuesRecord = await getSecretValuesRecord(client, awsSecretsRecord);

    if (destinationConfig.mappingBehavior === AwsSecretsManagerSyncMappingBehavior.OneToOne) {
      for await (const entry of Object.entries(secretMap)) {
        const [key, { value }] = entry;

        // skip secrets that don't have a value set
        if (!value) {
          // eslint-disable-next-line no-continue
          continue;
        }

        if (awsSecretsRecord[key]) {
          // skip secrets that haven't changed
          if (awsValuesRecord[key]?.SecretString === value) {
            // eslint-disable-next-line no-continue
            continue;
          }

          try {
            await updateSecret(client, {
              SecretId: key,
              SecretString: value
            });
          } catch (error) {
            throw new SecretSyncError({
              error,
              secretKey: key
            });
          }
        } else {
          try {
            await createSecret(client, {
              Name: key,
              SecretString: value
            });
          } catch (error) {
            throw new SecretSyncError({
              error,
              secretKey: key
            });
          }
        }
      }

      for await (const secretKey of Object.keys(awsSecretsRecord)) {
        if (!(secretKey in secretMap) || !secretMap[secretKey].value) {
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
      // Many-To-One Mapping

      const secretValue = JSON.stringify(
        Object.fromEntries(Object.entries(secretMap).map(([key, secretData]) => [key, secretData.value]))
      );

      if (awsValuesRecord[destinationConfig.secretName]) {
        await updateSecret(client, {
          SecretId: destinationConfig.secretName,
          SecretString: secretValue
        });
      } else {
        await createSecret(client, {
          Name: destinationConfig.secretName,
          SecretString: secretValue
        });
      }

      for await (const secretKey of Object.keys(awsSecretsRecord)) {
        if (secretKey === destinationConfig.secretName) {
          // eslint-disable-next-line no-continue
          continue;
        }

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
  },
  getSecrets: async (secretSync: TAwsSecretsManagerSyncWithCredentials): Promise<TSecretMap> => {
    const client = await getSecretsManagerClient(secretSync);

    const awsSecretsRecord = await getSecretsRecord(client);
    const awsValuesRecord = await getSecretValuesRecord(client, awsSecretsRecord);

    const { destinationConfig } = secretSync;

    if (destinationConfig.mappingBehavior === AwsSecretsManagerSyncMappingBehavior.OneToOne) {
      return Object.fromEntries(
        Object.keys(awsSecretsRecord).map((key) => [key, { value: awsValuesRecord[key].SecretString ?? "" }])
      );
    }

    // Many-To-One Mapping

    const secretValueEntry = awsValuesRecord[destinationConfig.secretName];

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
    const { destinationConfig } = secretSync;

    const client = await getSecretsManagerClient(secretSync);

    const awsSecretsRecord = await getSecretsRecord(client);

    if (destinationConfig.mappingBehavior === AwsSecretsManagerSyncMappingBehavior.OneToOne) {
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
      await deleteSecret(client, destinationConfig.secretName);
    }
  }
};
