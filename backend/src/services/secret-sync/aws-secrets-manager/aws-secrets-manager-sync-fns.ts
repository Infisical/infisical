import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws";
import { AwsSecretsManagerSyncMappingBehavior } from "@app/services/secret-sync/aws-secrets-manager/aws-secrets-manager-sync-enums";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums"; // Correct import for AWSRegion type
import { awsSignedRequest, AwsCredentials } from "@app/lib/aws/aws-signed-request";
import { randomUUID } from "crypto";

import { TAwsSecretsManagerSyncWithCredentials } from "./aws-secrets-manager-sync-types";

const MAX_RETRIES = 5;
const BATCH_SIZE = 20;

const refreshAwsCredentials = async (connection: TAwsConnectionConfig, region: AWSRegion): Promise<AwsCredentials> => {
  const config = await getAwsConnectionConfig(connection, region);
  return config.credentials as AwsCredentials;
};

const getAwsSMConfig = async (
  secretSync: TAwsSecretsManagerSyncWithCredentials
): Promise<{ region: AWSRegion; credentials: AwsCredentials }> => {
  const { destinationConfig, connection } = secretSync;
  let config = await getAwsConnectionConfig(connection, destinationConfig.region as AWSRegion);

  // Check if credentials are valid
  if (!config.credentials || !config.credentials.accessKeyId || !config.credentials.secretAccessKey) {
    console.warn("AWS credentials are missing or invalid. Attempting to refresh...");
    config.credentials = await refreshAwsCredentials(connection, destinationConfig.region as AWSRegion);
  }

  return {
    region: config.region as AWSRegion,
    credentials: config.credentials as AwsCredentials
  };
};

const sleep = async () =>
  new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });

const getSecretsRecord = async (secretSync: TAwsSecretsManagerSyncWithCredentials): Promise<Record<string, any>> => {
  const { region, credentials } = await getAwsSMConfig(secretSync);
  const awsSecretsRecord: Record<string, any> = {};
  let hasNext = true;
  let nextToken: string | undefined;
  let attempt = 0;

  while (hasNext) {
    try {
      const body = JSON.stringify({ NextToken: nextToken }); // Send body as JSON object

      // eslint-disable-next-line no-await-in-loop
      const output = await awsSignedRequest({
        region,
        service: "secretsmanager",
        method: "POST",
        host: `secretsmanager.${region}.amazonaws.com`,
        path: "/",
        body,
        credentials,
        target: "secretsmanager.ListSecrets"
      });

      attempt = 0;
      if (output.SecretList) {
        output.SecretList.forEach((secretEntry: any) => {
          if (secretEntry.Name) {
            awsSecretsRecord[secretEntry.Name] = secretEntry;
          }
        });
      }
      hasNext = Boolean(output.NextToken);
      nextToken = output.NextToken;
    } catch (e: any) {
      console.error("Error in ListSecrets API:", e.message);
      if (e.message?.includes("ThrottlingException") && attempt < MAX_RETRIES) {
        attempt += 1;
        // eslint-disable-next-line no-await-in-loop
        await sleep();
        continue;
      }
      throw e;
    }
  }
  return awsSecretsRecord;
};

const getSecretValuesRecord = async (
  secretSync: TAwsSecretsManagerSyncWithCredentials,
  awsSecretsRecord: Record<string, any>
): Promise<Record<string, any>> => {
  const { region, credentials } = await getAwsSMConfig(secretSync);
  const awsSecretValuesRecord: Record<string, any> = {};
  let attempt = 0;
  const secretIdList = Object.keys(awsSecretsRecord);
  for (let i = 0; i < secretIdList.length; i += BATCH_SIZE) {
    const batchSecretIds = secretIdList.slice(i, i + BATCH_SIZE);
    let hasNext = true;
    let nextToken: string | undefined;
    while (hasNext) {
      try {
        // Use JSON body for BatchGetSecretValue
        const body = JSON.stringify({
          SecretIdList: batchSecretIds,
          ...(nextToken ? { NextToken: nextToken } : {})
        });
        // eslint-disable-next-line no-await-in-loop
        const output = await awsSignedRequest({
          region,
          service: "secretsmanager",
          method: "POST",
          host: `secretsmanager.${region}.amazonaws.com`,
          path: "/",
          body,
          credentials,
          headers: { "X-Amz-Target": "secretsmanager.BatchGetSecretValue" },
          target: "secretsmanager.BatchGetSecretValue"
        });
        attempt = 0;
        if (output.SecretValues) {
          output.SecretValues.forEach((secretValueEntry: any) => {
            if (secretValueEntry.Name) {
              awsSecretValuesRecord[secretValueEntry.Name] = secretValueEntry;
            }
          });
        }
        hasNext = Boolean(output.NextToken);
        nextToken = output.NextToken;
      } catch (e: any) {
        if (e.message?.includes("ThrottlingException") && attempt < MAX_RETRIES) {
          attempt += 1;
          // eslint-disable-next-line no-await-in-loop
          await sleep();
          continue;
        }
        throw e;
      }
    }
  }
  return awsSecretValuesRecord;
};

const describeSecret = async (
  secretSync: TAwsSecretsManagerSyncWithCredentials,
  secretId: string,
  attempt = 0
): Promise<any> => {
  const { region, credentials } = await getAwsSMConfig(secretSync);
  try {
    // Use JSON body and correct X-Amz-Target
    const body = JSON.stringify({ SecretId: secretId });
    return await awsSignedRequest({
      region,
      service: "secretsmanager",
      method: "POST",
      host: `secretsmanager.${region}.amazonaws.com`,
      path: "/",
      body,
      credentials,
      headers: { "X-Amz-Target": "secretsmanager.DescribeSecret" },
      target: "secretsmanager.DescribeSecret"
    });
  } catch (error: any) {
    if (error.message?.includes("ThrottlingException") && attempt < MAX_RETRIES) {
      await sleep();
      return describeSecret(secretSync, secretId, attempt + 1);
    }
    throw error;
  }
};

const getSecretDescriptionsRecord = async (
  secretSync: TAwsSecretsManagerSyncWithCredentials,
  awsSecretsRecord: Record<string, any>
): Promise<Record<string, any>> => {
  const awsSecretDescriptionsRecord: Record<string, any> = {};
  for await (const secretKey of Object.keys(awsSecretsRecord)) {
    try {
      awsSecretDescriptionsRecord[secretKey] = await describeSecret(secretSync, secretKey);
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
  secretSync: TAwsSecretsManagerSyncWithCredentials,
  input: { Name: string; SecretString: string; KmsKeyId?: string },
  attempt = 0
): Promise<any> => {
  const { region, credentials } = await getAwsSMConfig(secretSync);
  try {
    // Use JSON body and correct X-Amz-Target
    const body = JSON.stringify({
      Name: input.Name,
      SecretString: input.SecretString,
      ...(input.KmsKeyId ? { KmsKeyId: input.KmsKeyId } : {}),
      ClientRequestToken: randomUUID()
    });
    return await awsSignedRequest({
      region,
      service: "secretsmanager",
      method: "POST",
      host: `secretsmanager.${region}.amazonaws.com`,
      path: "/",
      body,
      credentials,
      headers: { "X-Amz-Target": "secretsmanager.CreateSecret" },
      target: "secretsmanager.CreateSecret"
    });
  } catch (error: any) {
    if (error.message?.includes("ThrottlingException") && attempt < MAX_RETRIES) {
      await sleep();
      return createSecret(secretSync, input, attempt + 1);
    }
    throw error;
  }
};

const updateSecret = async (
  secretSync: TAwsSecretsManagerSyncWithCredentials,
  input: { SecretId: string; SecretString: string; KmsKeyId?: string },
  attempt = 0
): Promise<any> => {
  const { region, credentials } = await getAwsSMConfig(secretSync);
  try {
    // Use JSON body and correct X-Amz-Target
    const body = JSON.stringify({
      SecretId: input.SecretId,
      SecretString: input.SecretString,
      ...(input.KmsKeyId ? { KmsKeyId: input.KmsKeyId } : {}),
      ClientRequestToken: randomUUID()
    });
    return await awsSignedRequest({
      region,
      service: "secretsmanager",
      method: "POST",
      host: `secretsmanager.${region}.amazonaws.com`,
      path: "/",
      body,
      credentials,
      headers: { "X-Amz-Target": "secretsmanager.UpdateSecret" },
      target: "secretsmanager.UpdateSecret"
    });
  } catch (error: any) {
    if (error.message?.includes("ThrottlingException") && attempt < MAX_RETRIES) {
      await sleep();
      return updateSecret(secretSync, input, attempt + 1);
    }
    throw error;
  }
};

const deleteSecret = async (
  secretSync: TAwsSecretsManagerSyncWithCredentials,
  secretKey: string,
  attempt = 0
): Promise<any> => {
  const { region, credentials } = await getAwsSMConfig(secretSync);
  try {
    // Use JSON body and correct X-Amz-Target
    const body = JSON.stringify({
      SecretId: secretKey,
      ForceDeleteWithoutRecovery: true
    });
    return await awsSignedRequest({
      region,
      service: "secretsmanager",
      method: "POST",
      host: `secretsmanager.${region}.amazonaws.com`,
      path: "/",
      body,
      credentials,
      headers: { "X-Amz-Target": "secretsmanager.DeleteSecret" },
      target: "secretsmanager.DeleteSecret"
    });
  } catch (error: any) {
    if (error.message?.includes("ThrottlingException") && attempt < MAX_RETRIES) {
      await sleep();
      return deleteSecret(secretSync, secretKey, attempt + 1);
    }
    throw error;
  }
};

const addTags = async (
  secretSync: TAwsSecretsManagerSyncWithCredentials,
  secretKey: string,
  tags: { Key: string; Value: string }[],
  attempt = 0
): Promise<any> => {
  const { region, credentials } = await getAwsSMConfig(secretSync);
  try {
    // Use JSON body and correct X-Amz-Target
    const body = JSON.stringify({
      SecretId: secretKey,
      Tags: tags
    });
    return await awsSignedRequest({
      region,
      service: "secretsmanager",
      method: "POST",
      host: `secretsmanager.${region}.amazonaws.com`,
      path: "/",
      body,
      credentials,
      headers: { "X-Amz-Target": "secretsmanager.TagResource" },
      target: "secretsmanager.TagResource"
    });
  } catch (error: any) {
    if (error.message?.includes("ThrottlingException") && attempt < MAX_RETRIES) {
      await sleep();
      return addTags(secretSync, secretKey, tags, attempt + 1);
    }
    throw error;
  }
};

const removeTags = async (
  secretSync: TAwsSecretsManagerSyncWithCredentials,
  secretKey: string,
  tagKeys: string[],
  attempt = 0
): Promise<any> => {
  const { region, credentials } = await getAwsSMConfig(secretSync);
  try {
    // Use JSON body and correct X-Amz-Target
    const body = JSON.stringify({
      SecretId: secretKey,
      TagKeys: tagKeys
    });
    return await awsSignedRequest({
      region,
      service: "secretsmanager",
      method: "POST",
      host: `secretsmanager.${region}.amazonaws.com`,
      path: "/",
      body,
      credentials,
      headers: { "X-Amz-Target": "secretsmanager.UntagResource" },
      target: "secretsmanager.UntagResource"
    });
  } catch (error: any) {
    if (error.message?.includes("ThrottlingException") && attempt < MAX_RETRIES) {
      await sleep();
      return removeTags(secretSync, secretKey, tagKeys, attempt + 1);
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
  const tagsToAdd: { Key: string; Value: string }[] = [];
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

export const AwsSecretsManagerSyncFns = {
  syncSecrets: async (secretSync: TAwsSecretsManagerSyncWithCredentials, secretMap: TSecretMap) => {
    const { destinationConfig, syncOptions } = secretSync;
    const awsSecretsRecord = await getSecretsRecord(secretSync);
    const awsValuesRecord = await getSecretValuesRecord(secretSync, awsSecretsRecord);
    const awsDescriptionsRecord = await getSecretDescriptionsRecord(secretSync, awsSecretsRecord);
    const syncTagsRecord = Object.fromEntries(syncOptions.tags?.map((tag: any) => [tag.key, tag.value]) ?? []);
    const keyId = syncOptions.keyId ?? "alias/aws/secretsmanager";
    if (destinationConfig.mappingBehavior === AwsSecretsManagerSyncMappingBehavior.OneToOne) {
      for await (const entry of Object.entries(secretMap)) {
        const [key, { value, secretMetadata }] = entry;
        if (!value) continue;
        if (awsSecretsRecord[key]) {
          if (awsValuesRecord[key]?.SecretString !== value || keyId !== awsDescriptionsRecord[key]?.KmsKeyId) {
            try {
              await updateSecret(secretSync, {
                SecretId: key,
                SecretString: value,
                KmsKeyId: keyId
              });
            } catch (error) {
              throw new SecretSyncError({ error, secretKey: key });
            }
          }
        } else {
          try {
            await createSecret(secretSync, {
              Name: key,
              SecretString: value,
              KmsKeyId: keyId
            });
          } catch (error) {
            throw new SecretSyncError({ error, secretKey: key });
          }
        }
        const { tagsToAdd, tagKeysToRemove } = processTags({
          syncTagsRecord: {
            ...(syncOptions.syncSecretMetadataAsTags &&
              Object.fromEntries(secretMetadata?.map((tag: any) => [tag.key, tag.value]) ?? [])),
            ...syncTagsRecord
          },
          awsTagsRecord: Object.fromEntries(
            awsDescriptionsRecord[key]?.Tags?.map((tag: any) => [tag.Key, tag.Value]) ?? []
          )
        });
        if (tagsToAdd.length) {
          try {
            await addTags(secretSync, key, tagsToAdd);
          } catch (error) {
            throw new SecretSyncError({ error, secretKey: key });
          }
        }
        if (tagKeysToRemove.length) {
          try {
            await removeTags(secretSync, key, tagKeysToRemove);
          } catch (error) {
            throw new SecretSyncError({ error, secretKey: key });
          }
        }
      }
      if (syncOptions.disableSecretDeletion) return;
      for await (const secretKey of Object.keys(awsSecretsRecord)) {
        if (!matchesSchema(secretKey, syncOptions.keySchema)) continue;
        if (!(secretKey in secretMap) || !secretMap[secretKey].value) {
          try {
            await deleteSecret(secretSync, secretKey);
          } catch (error) {
            throw new SecretSyncError({ error, secretKey });
          }
        }
      }
    } else {
      // Many-To-One Mapping
      const secretValue = JSON.stringify(
        Object.fromEntries(Object.entries(secretMap).map(([key, secretData]) => [key, secretData.value]))
      );
      if (awsSecretsRecord[destinationConfig.secretName]) {
        await updateSecret(secretSync, {
          SecretId: destinationConfig.secretName,
          SecretString: secretValue,
          KmsKeyId: keyId
        });
      } else {
        await createSecret(secretSync, {
          Name: destinationConfig.secretName,
          SecretString: secretValue,
          KmsKeyId: keyId
        });
      }
      const { tagsToAdd, tagKeysToRemove } = processTags({
        syncTagsRecord,
        awsTagsRecord: Object.fromEntries(
          awsDescriptionsRecord[destinationConfig.secretName]?.Tags?.map((tag: any) => [tag.Key, tag.Value]) ?? []
        )
      });
      if (tagsToAdd.length) {
        try {
          await addTags(secretSync, destinationConfig.secretName, tagsToAdd);
        } catch (error) {
          throw new SecretSyncError({ error, secretKey: destinationConfig.secretName });
        }
      }
      if (tagKeysToRemove.length) {
        try {
          await removeTags(secretSync, destinationConfig.secretName, tagKeysToRemove);
        } catch (error) {
          throw new SecretSyncError({ error, secretKey: destinationConfig.secretName });
        }
      }
    }
  },
  getSecrets: async (secretSync: TAwsSecretsManagerSyncWithCredentials): Promise<TSecretMap> => {
    const awsSecretsRecord = await getSecretsRecord(secretSync);
    const awsValuesRecord = await getSecretValuesRecord(secretSync, awsSecretsRecord);
    const { destinationConfig } = secretSync;
    if (destinationConfig.mappingBehavior === AwsSecretsManagerSyncMappingBehavior.OneToOne) {
      return Object.fromEntries(
        Object.keys(awsSecretsRecord).map((key) => [key, { value: awsValuesRecord[key]?.SecretString ?? "" }])
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
    const awsSecretsRecord = await getSecretsRecord(secretSync);
    if (destinationConfig.mappingBehavior === AwsSecretsManagerSyncMappingBehavior.OneToOne) {
      for await (const secretKey of Object.keys(awsSecretsRecord)) {
        if (secretKey in secretMap) {
          try {
            await deleteSecret(secretSync, secretKey);
          } catch (error) {
            throw new SecretSyncError({ error, secretKey });
          }
        }
      }
    } else {
      await deleteSecret(secretSync, destinationConfig.secretName);
    }
  }
};
