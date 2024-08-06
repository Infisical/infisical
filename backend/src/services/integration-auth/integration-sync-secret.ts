/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable no-param-reassign,no-await-in-loop */
// Taken from old code and too much work at present thus disabling the above any rules
// resolve it later: akhilmhdh - TODO

import {
  CreateSecretCommand,
  DescribeSecretCommand,
  GetSecretValueCommand,
  ResourceNotFoundException,
  SecretsManagerClient,
  TagResourceCommand,
  UntagResourceCommand,
  UpdateSecretCommand
} from "@aws-sdk/client-secrets-manager";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { Octokit } from "@octokit/rest";
import AWS, { AWSError } from "aws-sdk";
import { AxiosError } from "axios";
import { randomUUID } from "crypto";
import sodium from "libsodium-wrappers";
import isEqual from "lodash.isequal";
import { z } from "zod";

import { SecretType, TIntegrationAuths, TIntegrations } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TCreateManySecretsRawFn, TUpdateManySecretsRawFn } from "@app/services/secret/secret-types";

import { TIntegrationDALFactory } from "../integration/integration-dal";
import { IntegrationMetadataSchema } from "../integration/integration-schema";
import {
  IntegrationInitialSyncBehavior,
  IntegrationMappingBehavior,
  Integrations,
  IntegrationUrls
} from "./integration-list";

const getSecretKeyValuePair = (secrets: Record<string, { value: string | null; comment?: string } | null>) =>
  Object.keys(secrets).reduce<Record<string, string | null | undefined>>((prev, key) => {
    // eslint-disable-next-line
    prev[key] = secrets?.[key] === null ? null : secrets?.[key]?.value;
    return prev;
  }, {});

const ZGetTenantEnv = z.object({
  data: z.object({
    getTenantEnv: z.object({
      hash: z.string(),
      envVars: z.object({
        environment: z.record(z.any()).optional()
      })
    })
  })
});

const ZUpdateTenantEnv = z.object({
  data: z.object({
    updateTenantEnv: z.object({
      hash: z.string(),
      envVars: z.record(z.any())
    })
  })
});

/**
 * Sync/push [secrets] to GCP secret manager project
 */
const syncSecretsGCPSecretManager = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  interface GCPSecret {
    name: string;
    createTime: string;
  }

  interface GCPSMListSecretsRes {
    secrets?: GCPSecret[];
    totalSize?: number;
    nextPageToken?: string;
  }

  let gcpSecrets: GCPSecret[] = [];

  const pageSize = 100;
  let pageToken: string | undefined;
  let hasMorePages = true;

  const metadata = z.record(z.any()).parse(integration.metadata);
  const filterParam = metadata.secretGCPLabel
    ? `?filter=labels.${metadata.secretGCPLabel.labelName}=${metadata.secretGCPLabel.labelValue}`
    : "";

  while (hasMorePages) {
    const params = new URLSearchParams({
      pageSize: String(pageSize),
      ...(pageToken ? { pageToken } : {})
    });

    const res = (
      await request.get<GCPSMListSecretsRes>(
        `${IntegrationUrls.GCP_SECRET_MANAGER_URL}/v1/projects/${integration.appId}/secrets${filterParam}`,
        {
          params,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        }
      )
    ).data;

    if (res.secrets) {
      const filteredSecrets = res.secrets?.filter((gcpSecret) => {
        const arr = gcpSecret.name.split("/");
        const key = arr[arr.length - 1];

        let isValid = true;

        if (metadata.secretPrefix && !key.startsWith(metadata.secretPrefix)) {
          isValid = false;
        }

        if (metadata.secretSuffix && !key.endsWith(metadata.secretSuffix)) {
          isValid = false;
        }

        return isValid;
      });

      gcpSecrets = gcpSecrets.concat(filteredSecrets);
    }

    if (!res.nextPageToken) {
      hasMorePages = false;
    }

    pageToken = res.nextPageToken;
  }

  const res: { [key: string]: string } = {};

  interface GCPLatestSecretVersionAccess {
    name: string;
    payload: {
      data: string;
    };
  }

  for await (const gcpSecret of gcpSecrets) {
    const arr = gcpSecret.name.split("/");
    const key = arr[arr.length - 1];

    const secretLatest: GCPLatestSecretVersionAccess = (
      await request.get(
        `${IntegrationUrls.GCP_SECRET_MANAGER_URL}/v1/projects/${integration.appId}/secrets/${key}/versions/latest:access`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        }
      )
    ).data;

    res[key] = Buffer.from(secretLatest.payload.data, "base64").toString("utf-8");
  }

  for await (const key of Object.keys(secrets)) {
    if (!(key in res)) {
      // case: create secret
      await request.post(
        `${IntegrationUrls.GCP_SECRET_MANAGER_URL}/v1/projects/${integration.appId}/secrets`,
        {
          replication: {
            automatic: {}
          },
          ...(metadata.secretGCPLabel
            ? {
                labels: {
                  [metadata.secretGCPLabel.labelName]: metadata.secretGCPLabel.labelValue
                }
              }
            : {})
        },
        {
          params: {
            secretId: key
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        }
      );

      await request.post(
        `${IntegrationUrls.GCP_SECRET_MANAGER_URL}/v1/projects/${integration.appId}/secrets/${key}:addVersion`,
        {
          payload: {
            data: Buffer.from(secrets[key].value).toString("base64")
          }
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        }
      );
    }
  }

  for await (const key of Object.keys(res)) {
    if (!(key in secrets)) {
      // case: delete secret
      await request.delete(
        `${IntegrationUrls.GCP_SECRET_MANAGER_URL}/v1/projects/${integration.appId}/secrets/${key}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        }
      );
    } else if (secrets[key].value !== res[key]) {
      await request.post(
        `${IntegrationUrls.GCP_SECRET_MANAGER_URL}/v1/projects/${integration.appId}/secrets/${key}:addVersion`,
        {
          payload: {
            data: Buffer.from(secrets[key].value).toString("base64")
          }
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        }
      );
    }
  }
};

/**
 * Sync/push [secrets] to Azure Key Vault with vault URI [integration.app]
 */
const syncSecretsAzureKeyVault = async ({
  integration,
  secrets,
  accessToken,
  createManySecretsRawFn,
  updateManySecretsRawFn
}: {
  integration: TIntegrations & {
    projectId: string;
    environment: {
      id: string;
      name: string;
      slug: string;
    };
    secretPath: string;
  };
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
  createManySecretsRawFn: (params: TCreateManySecretsRawFn) => Promise<Array<{ id: string }>>;
  updateManySecretsRawFn: (params: TUpdateManySecretsRawFn) => Promise<Array<{ id: string }>>;
}) => {
  interface GetAzureKeyVaultSecret {
    id: string; // secret URI
    value: string;
    attributes: {
      enabled: true;
      created: number;
      updated: number;
      recoveryLevel: string;
      recoverableDays: number;
    };
  }

  interface AzureKeyVaultSecret extends GetAzureKeyVaultSecret {
    key: string;
  }

  /**
   * Return all secrets from Azure Key Vault by paginating through URL [url]
   * @param {String} url - pagination URL to get next set of secrets from Azure Key Vault
   * @returns
   */
  const paginateAzureKeyVaultSecrets = async (url: string) => {
    let result: GetAzureKeyVaultSecret[] = [];
    while (url) {
      const res = await request.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      result = result.concat(res.data.value);

      url = res.data.nextLink;
    }

    return result;
  };

  const getAzureKeyVaultSecrets = await paginateAzureKeyVaultSecrets(`${integration.app}/secrets?api-version=7.3`);

  let lastSlashIndex: number;
  const res = (
    await Promise.all(
      getAzureKeyVaultSecrets.map(async (getAzureKeyVaultSecret) => {
        if (!lastSlashIndex) {
          lastSlashIndex = getAzureKeyVaultSecret.id.lastIndexOf("/");
        }

        const azureKeyVaultSecret = await request.get(`${getAzureKeyVaultSecret.id}?api-version=7.3`, {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });

        return {
          ...azureKeyVaultSecret.data,
          key: getAzureKeyVaultSecret.id.substring(lastSlashIndex + 1)
        };
      })
    )
  ).reduce(
    (obj, secret) => ({
      ...obj,
      [secret.key]: secret
    }),
    {}
  );

  const setSecrets: {
    key: string;
    value: string;
  }[] = [];

  Object.keys(secrets).forEach((key) => {
    const hyphenatedKey = key.replace(/_/g, "-");
    if (!(hyphenatedKey in res)) {
      // case: secret has been created
      setSecrets.push({
        key: hyphenatedKey,
        value: secrets[key].value
      });
    } else if (secrets[key] !== res[hyphenatedKey].value) {
      // case: secret has been updated
      setSecrets.push({
        key: hyphenatedKey,
        value: secrets[key].value
      });
    }
  });

  const deleteSecrets: AzureKeyVaultSecret[] = [];

  Object.keys(res).forEach((key) => {
    const underscoredKey = key.replace(/-/g, "_");
    if (!(underscoredKey in secrets)) {
      deleteSecrets.push(res[key]);
    }
  });

  const secretsToAdd: { [key: string]: string } = {};
  const secretsToUpdate: { [key: string]: string } = {};
  const secretKeysToRemoveFromDelete = new Set<string>();

  const metadata = IntegrationMetadataSchema.parse(integration.metadata);
  if (!integration.lastUsed) {
    Object.keys(res).forEach((key) => {
      // first time using integration
      const underscoredKey = key.replace(/-/g, "_");

      // -> apply initial sync behavior
      switch (metadata.initialSyncBehavior) {
        case IntegrationInitialSyncBehavior.PREFER_TARGET: {
          if (!(underscoredKey in secrets)) {
            secretsToAdd[underscoredKey] = res[key].value;
            setSecrets.push({
              key,
              value: res[key].value
            });
          } else if (secrets[underscoredKey]?.value !== res[key].value) {
            secretsToUpdate[underscoredKey] = res[key].value;
            const toEditSecretIndex = setSecrets.findIndex((secret) => secret.key === key);
            if (toEditSecretIndex >= 0) {
              setSecrets[toEditSecretIndex].value = res[key].value;
            }
          }

          secretKeysToRemoveFromDelete.add(key);

          break;
        }
        case IntegrationInitialSyncBehavior.PREFER_SOURCE: {
          if (!(underscoredKey in secrets)) {
            secretsToAdd[underscoredKey] = res[key].value;
            setSecrets.push({
              key,
              value: res[key].value
            });
          }

          secretKeysToRemoveFromDelete.add(key);
          break;
        }
        default:
          break;
      }
    });
  }

  if (Object.keys(secretsToUpdate).length) {
    await updateManySecretsRawFn({
      projectId: integration.projectId,
      environment: integration.environment.slug,
      path: integration.secretPath,
      secrets: Object.keys(secretsToUpdate).map((key) => ({
        secretName: key,
        secretValue: secretsToUpdate[key],
        type: SecretType.Shared,
        secretComment: ""
      }))
    });
  }

  if (Object.keys(secretsToAdd).length) {
    await createManySecretsRawFn({
      projectId: integration.projectId,
      environment: integration.environment.slug,
      path: integration.secretPath,
      secrets: Object.keys(secretsToAdd).map((key) => ({
        secretName: key,
        secretValue: secretsToAdd[key],
        type: SecretType.Shared,
        secretComment: ""
      }))
    });
  }

  const setSecretAzureKeyVault = async ({
    key,
    value,
    integration: azIntegration,
    accessToken: accToken
  }: {
    key: string;
    value: string;
    integration: TIntegrations;
    accessToken: string;
  }) => {
    let isSecretSet = false;
    let maxTries = 6;

    while (!isSecretSet && maxTries > 0) {
      // try to set secret
      try {
        await request.put(
          `${azIntegration.app}/secrets/${key}?api-version=7.3`,
          {
            value
          },
          {
            headers: {
              Authorization: `Bearer ${accToken}`
            }
          }
        );

        isSecretSet = true;
      } catch (err) {
        const error = err as AxiosError;
        // eslint-disable-next-line
        if ((error?.response?.data as any)?.error?.innererror?.code === "ObjectIsDeletedButRecoverable") {
          await request.post(
            `${azIntegration.app}/deletedsecrets/${key}/recover?api-version=7.3`,
            {},
            {
              headers: {
                Authorization: `Bearer ${accToken}`
              }
            }
          );
          await new Promise((resolve) => {
            setTimeout(resolve, 10000);
          });
        } else {
          await new Promise((resolve) => {
            setTimeout(resolve, 10000);
          });
          maxTries -= 1;
        }
      }
    }
  };

  // Sync/push set secrets
  for await (const setSecret of setSecrets) {
    const { key, value } = setSecret;
    await setSecretAzureKeyVault({
      key,
      value,
      integration,
      accessToken
    });
  }

  for await (const deleteSecret of deleteSecrets.filter((secret) => !secretKeysToRemoveFromDelete.has(secret.key))) {
    const { key } = deleteSecret;
    await request.delete(`${integration.app}/secrets/${key}?api-version=7.3`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }
};

/**
 * Sync/push [secrets] to AWS parameter store
 */
const syncSecretsAWSParameterStore = async ({
  integration,
  secrets,
  accessId,
  accessToken
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessId: string | null;
  accessToken: string;
}) => {
  let response: { isSynced: boolean; syncMessage: string } | null = null;

  if (!accessId) {
    throw new Error("AWS access ID is required");
  }

  const config = new AWS.Config({
    region: integration.region as string,
    credentials: {
      accessKeyId: accessId,
      secretAccessKey: accessToken
    }
  });

  const ssm = new AWS.SSM({
    apiVersion: "2014-11-06",
    region: integration.region as string
  });
  ssm.config.update(config);

  const metadata = z.record(z.any()).parse(integration.metadata || {});
  const awsParameterStoreSecretsObj: Record<string, AWS.SSM.Parameter> = {};

  // now fetch all aws parameter store secrets
  let hasNext = true;
  let nextToken: string | undefined;
  while (hasNext) {
    const parameters = await ssm
      .getParametersByPath({
        Path: integration.path as string,
        Recursive: false,
        WithDecryption: true,
        MaxResults: 10,
        NextToken: nextToken
      })
      .promise();

    if (parameters.Parameters) {
      parameters.Parameters.forEach((parameter) => {
        if (parameter.Name) {
          const secKey = parameter.Name.substring((integration.path as string).length);
          awsParameterStoreSecretsObj[secKey] = parameter;
        }
      });
    }
    hasNext = Boolean(parameters.NextToken);
    nextToken = parameters.NextToken;
  }

  // Identify secrets to create
  // don't use Promise.all() and promise map here
  // it will cause rate limit
  for (const key in secrets) {
    if (Object.hasOwn(secrets, key)) {
      if (!(key in awsParameterStoreSecretsObj)) {
        // case: secret does not exist in AWS parameter store
        // -> create secret
        if (secrets[key].value) {
          await ssm
            .putParameter({
              Name: `${integration.path}${key}`,
              Type: "SecureString",
              Value: secrets[key].value,
              ...(metadata.kmsKeyId && { KeyId: metadata.kmsKeyId }),
              // Overwrite: true,
              Tags: metadata.secretAWSTag
                ? metadata.secretAWSTag.map((tag: { key: string; value: string }) => ({
                    Key: tag.key,
                    Value: tag.value
                  }))
                : []
            })
            .promise();
        }
        // case: secret exists in AWS parameter store
      } else {
        // -> update secret
        if (awsParameterStoreSecretsObj[key].Value !== secrets[key].value) {
          await ssm
            .putParameter({
              Name: `${integration.path}${key}`,
              Type: "SecureString",
              Value: secrets[key].value,
              Overwrite: true
            })
            .promise();
        }

        if (awsParameterStoreSecretsObj[key].Name) {
          try {
            await ssm
              .addTagsToResource({
                ResourceType: "Parameter",
                ResourceId: awsParameterStoreSecretsObj[key].Name as string,
                Tags: metadata.secretAWSTag
                  ? metadata.secretAWSTag.map((tag: { key: string; value: string }) => ({
                      Key: tag.key,
                      Value: tag.value
                    }))
                  : []
              })
              .promise();
          } catch (err) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((err as any).code === "AccessDeniedException") {
              logger.error(
                `AWS Parameter Store Error [integration=${integration.id}]: double check AWS account permissions (refer to the Infisical docs)`
              );
            }

            response = {
              isSynced: false,
              syncMessage: (err as AWSError)?.message || "Error syncing with AWS Parameter Store"
            };
          }
        }
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }
  }

  if (!metadata.shouldDisableDelete) {
    for (const key in awsParameterStoreSecretsObj) {
      if (Object.hasOwn(awsParameterStoreSecretsObj, key)) {
        if (!(key in secrets)) {
          // case:
          // -> delete secret
          await ssm
            .deleteParameter({
              Name: awsParameterStoreSecretsObj[key].Name as string
            })
            .promise();
        }
        await new Promise((resolve) => {
          setTimeout(resolve, 50);
        });
      }
    }
  }

  return response;
};

/**
 * Sync/push [secrets] to AWS Secrets Manager
 */
const syncSecretsAWSSecretManager = async ({
  integration,
  secrets,
  accessId,
  accessToken,
  awsAssumeRoleArn,
  projectId
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessId: string | null;
  accessToken: string;
  awsAssumeRoleArn: string | null;
  projectId?: string;
}) => {
  const appCfg = getConfig();
  const metadata = z.record(z.any()).parse(integration.metadata || {});

  if (!accessId && !awsAssumeRoleArn) {
    throw new Error("AWS access ID/AWS Assume Role is required");
  }

  let accessKeyId = "";
  let secretAccessKey = "";
  let sessionToken;
  if (awsAssumeRoleArn) {
    const client = new STSClient({
      region: integration.region as string,
      credentials:
        appCfg.CLIENT_ID_AWS_INTEGRATION && appCfg.CLIENT_SECRET_AWS_INTEGRATION
          ? {
              accessKeyId: appCfg.CLIENT_ID_AWS_INTEGRATION,
              secretAccessKey: appCfg.CLIENT_SECRET_AWS_INTEGRATION
            }
          : undefined
    });
    const command = new AssumeRoleCommand({
      RoleArn: awsAssumeRoleArn,
      RoleSessionName: `infisical-sm-${randomUUID()}`,
      DurationSeconds: 900, // 15mins
      ExternalId: projectId
    });
    const response = await client.send(command);
    if (!response.Credentials?.AccessKeyId || !response.Credentials?.SecretAccessKey)
      throw new Error("Failed to assume role");
    accessKeyId = response.Credentials?.AccessKeyId;
    secretAccessKey = response.Credentials?.SecretAccessKey;
    sessionToken = response.Credentials?.SessionToken;
  } else {
    accessKeyId = accessId as string;
    secretAccessKey = accessToken;
  }

  const secretsManager = new SecretsManagerClient({
    region: integration.region as string,
    credentials: {
      accessKeyId,
      secretAccessKey,
      sessionToken
    }
  });

  const processAwsSecret = async (
    secretId: string,
    secretValue: Record<string, string | null | undefined> | string
  ) => {
    try {
      const awsSecretManagerSecret = await secretsManager.send(
        new GetSecretValueCommand({
          SecretId: secretId
        })
      );

      let secretToCompare;
      if (awsSecretManagerSecret?.SecretString) {
        if (typeof secretValue === "string") {
          secretToCompare = awsSecretManagerSecret.SecretString;
        } else {
          secretToCompare = JSON.parse(awsSecretManagerSecret.SecretString);
        }
      }

      if (!isEqual(secretToCompare, secretValue)) {
        await secretsManager.send(
          new UpdateSecretCommand({
            SecretId: secretId,
            SecretString: typeof secretValue === "string" ? secretValue : JSON.stringify(secretValue)
          })
        );
      }

      const secretAWSTag = metadata.secretAWSTag as { key: string; value: string }[] | undefined;

      if (secretAWSTag && secretAWSTag.length) {
        const describedSecret = await secretsManager.send(
          // requires secretsmanager:DescribeSecret policy
          new DescribeSecretCommand({
            SecretId: secretId
          })
        );

        if (!describedSecret.Tags) return;

        const integrationTagObj = secretAWSTag.reduce(
          (acc, item) => {
            acc[item.key] = item.value;
            return acc;
          },
          {} as Record<string, string>
        );

        const awsTagObj = (describedSecret.Tags || []).reduce(
          (acc, item) => {
            if (item.Key && item.Value) {
              acc[item.Key] = item.Value;
            }
            return acc;
          },
          {} as Record<string, string>
        );

        const tagsToUpdate: { Key: string; Value: string }[] = [];
        const tagsToDelete: { Key: string; Value: string }[] = [];

        describedSecret.Tags?.forEach((tag) => {
          if (tag.Key && tag.Value) {
            if (!(tag.Key in integrationTagObj)) {
              // delete tag from AWS secret manager
              tagsToDelete.push({
                Key: tag.Key,
                Value: tag.Value
              });
            } else if (tag.Value !== integrationTagObj[tag.Key]) {
              // update tag in AWS secret manager
              tagsToUpdate.push({
                Key: tag.Key,
                Value: integrationTagObj[tag.Key]
              });
            }
          }
        });

        secretAWSTag?.forEach((tag) => {
          if (!(tag.key in awsTagObj)) {
            // create tag in AWS secret manager
            tagsToUpdate.push({
              Key: tag.key,
              Value: tag.value
            });
          }
        });

        if (tagsToUpdate.length) {
          await secretsManager.send(
            new TagResourceCommand({
              SecretId: secretId,
              Tags: tagsToUpdate
            })
          );
        }

        if (tagsToDelete.length) {
          await secretsManager.send(
            new UntagResourceCommand({
              SecretId: secretId,
              TagKeys: tagsToDelete.map((tag) => tag.Key)
            })
          );
        }
      }
    } catch (err) {
      // case 1: when AWS manager can't find the specified secret
      if (err instanceof ResourceNotFoundException && secretsManager) {
        await secretsManager.send(
          new CreateSecretCommand({
            Name: secretId,
            SecretString: typeof secretValue === "string" ? secretValue : JSON.stringify(secretValue),
            ...(metadata.kmsKeyId && { KmsKeyId: metadata.kmsKeyId }),
            Tags: metadata.secretAWSTag
              ? metadata.secretAWSTag.map((tag: { key: string; value: string }) => ({ Key: tag.key, Value: tag.value }))
              : []
          })
        );
        // case 2: something unexpected went wrong, so we'll throw the error to reflect the error in the integration sync status
      } else {
        throw err;
      }
    }
  };

  if (metadata.mappingBehavior === IntegrationMappingBehavior.ONE_TO_ONE) {
    for await (const [key, value] of Object.entries(secrets)) {
      await processAwsSecret(key, value.value);
    }
  } else {
    await processAwsSecret(integration.app as string, getSecretKeyValuePair(secrets));
  }
};

/**
 * Sync/push [secrets] to Heroku app named [integration.app]
 */
const syncSecretsHeroku = async ({
  createManySecretsRawFn,
  updateManySecretsRawFn,
  integration,
  secrets,
  accessToken
}: {
  createManySecretsRawFn: (params: TCreateManySecretsRawFn) => Promise<Array<{ id: string }>>;
  updateManySecretsRawFn: (params: TUpdateManySecretsRawFn) => Promise<Array<{ id: string }>>;
  integration: TIntegrations & {
    projectId: string;
    environment: {
      id: string;
      name: string;
      slug: string;
    };
    secretPath: string;
  };
  secrets: Record<string, { value: string; comment?: string } | null>;
  accessToken: string;
}) => {
  const herokuSecrets = (
    await request.get(`${IntegrationUrls.HEROKU_API_URL}/apps/${integration.app}/config-vars`, {
      headers: {
        Accept: "application/vnd.heroku+json; version=3",
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    })
  ).data;

  const secretsToAdd: { [key: string]: string } = {};
  const secretsToUpdate: { [key: string]: string } = {};

  const metadata = z.record(z.any()).parse(integration.metadata);

  Object.keys(herokuSecrets).forEach((key) => {
    if (!integration.lastUsed) {
      // first time using integration
      // -> apply initial sync behavior
      switch (metadata.initialSyncBehavior) {
        case IntegrationInitialSyncBehavior.OVERWRITE_TARGET: {
          if (!(key in secrets)) secrets[key] = null;
          break;
        }
        case IntegrationInitialSyncBehavior.PREFER_TARGET: {
          if (!(key in secrets)) {
            secretsToAdd[key] = herokuSecrets[key];
          } else if (secrets[key]?.value !== herokuSecrets[key]) {
            secretsToUpdate[key] = herokuSecrets[key];
          }
          secrets[key] = {
            value: herokuSecrets[key]
          };
          break;
        }
        case IntegrationInitialSyncBehavior.PREFER_SOURCE: {
          if (!(key in secrets)) {
            secrets[key] = herokuSecrets[key];
            secretsToAdd[key] = herokuSecrets[key];
          }
          break;
        }
        default: {
          if (!(key in secrets)) secrets[key] = null;
          break;
        }
      }
    } else if (!(key in secrets)) secrets[key] = null;
  });

  if (Object.keys(secretsToAdd).length) {
    await createManySecretsRawFn({
      projectId: integration.projectId,
      environment: integration.environment.slug,
      path: integration.secretPath,
      secrets: Object.keys(secretsToAdd).map((key) => ({
        secretName: key,
        secretValue: secretsToAdd[key],
        type: SecretType.Shared,
        secretComment: ""
      }))
    });
  }

  if (Object.keys(secretsToUpdate).length) {
    await updateManySecretsRawFn({
      projectId: integration.projectId,
      environment: integration.environment.slug,
      path: integration.secretPath,
      secrets: Object.keys(secretsToUpdate).map((key) => ({
        secretName: key,
        secretValue: secretsToUpdate[key],
        type: SecretType.Shared,
        secretComment: ""
      }))
    });
  }

  await request.patch(
    `${IntegrationUrls.HEROKU_API_URL}/apps/${integration.app}/config-vars`,
    getSecretKeyValuePair(secrets),
    {
      headers: {
        Accept: "application/vnd.heroku+json; version=3",
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    }
  );
};

/**
 * Sync/push [secrets] to Vercel project named [integration.app]
 */
const syncSecretsVercel = async ({
  integration,
  integrationAuth,
  secrets,
  accessToken
}: {
  integration: TIntegrations;
  integrationAuth: TIntegrationAuths;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  interface VercelSecret {
    id?: string;
    type: string;
    key: string;
    value: string;
    target: string[];
    gitBranch?: string;
  }
  // Get all (decrypted) secrets back from Vercel in
  // decrypted format
  const params: { [key: string]: string } = {
    decrypt: "true",
    ...(integrationAuth?.teamId
      ? {
          teamId: integrationAuth.teamId
        }
      : {}),
    ...(integration?.path
      ? {
          gitBranch: integration?.path
        }
      : {})
  };

  const vercelSecrets = (
    await request.get<{ envs: VercelSecret[] }>(
      `${IntegrationUrls.VERCEL_API_URL}/v9/projects/${integration.app}/env`,
      {
        params,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    )
  ).data.envs.filter((secret) => {
    if (!secret.target.includes(integration.targetEnvironment as string)) {
      // case: secret does not have the same target environment
      return false;
    }

    if (integration.targetEnvironment === "preview" && secret.gitBranch && integration.path !== secret.gitBranch) {
      // case: secret on preview environment does not have same target git branch
      return false;
    }

    return true;
  });

  const res: { [key: string]: VercelSecret } = {};

  for await (const vercelSecret of vercelSecrets) {
    if (vercelSecret.type === "encrypted") {
      // case: secret is encrypted -> need to decrypt
      const decryptedSecret = (
        await request.get(`${IntegrationUrls.VERCEL_API_URL}/v9/projects/${integration.app}/env/${vercelSecret.id}`, {
          params,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        })
      ).data;

      res[vercelSecret.key] = decryptedSecret;
    } else {
      res[vercelSecret.key] = vercelSecret;
    }
  }

  const updateSecrets: VercelSecret[] = [];
  const deleteSecrets: VercelSecret[] = [];
  const newSecrets: VercelSecret[] = [];

  // Identify secrets to create
  Object.keys(secrets).forEach((key) => {
    if (!(key in res)) {
      // case: secret has been created
      newSecrets.push({
        key,
        value: secrets[key].value,
        type: "encrypted",
        target: [integration.targetEnvironment as string],
        ...(integration.path
          ? {
              gitBranch: integration.path
            }
          : {})
      });
    }
  });

  // Identify secrets to update and delete
  Object.keys(res).forEach((key) => {
    if (key in secrets) {
      if (res[key].value !== secrets[key].value) {
        // case: secret value has changed
        updateSecrets.push({
          id: res[key].id,
          key,
          value: secrets[key].value,
          type: res[key].type,
          target: res[key].target.includes(integration.targetEnvironment as string)
            ? [...res[key].target]
            : [...res[key].target, integration.targetEnvironment as string],
          ...(integration.path
            ? {
                gitBranch: integration.path
              }
            : {})
        });
      }
    } else {
      // case: secret has been deleted
      deleteSecrets.push({
        id: res[key].id,
        key,
        value: res[key].value,
        type: "encrypted", // value doesn't matter
        target: [integration.targetEnvironment as string],
        ...(integration.path
          ? {
              gitBranch: integration.path
            }
          : {})
      });
    }
  });

  // Sync/push new secrets
  if (newSecrets.length > 0) {
    await request.post(`${IntegrationUrls.VERCEL_API_URL}/v10/projects/${integration.app}/env`, newSecrets, {
      params,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    });
  }

  for await (const secret of updateSecrets) {
    if (secret.type !== "sensitive") {
      const { id, ...updatedSecret } = secret;
      await request.patch(`${IntegrationUrls.VERCEL_API_URL}/v9/projects/${integration.app}/env/${id}`, updatedSecret, {
        params,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      });
    }
  }

  for await (const secret of deleteSecrets) {
    await request.delete(`${IntegrationUrls.VERCEL_API_URL}/v9/projects/${integration.app}/env/${secret.id}`, {
      params,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    });
  }
};

/**
 * Sync/push [secrets] to Netlify site with id [integration.appId]
 */
const syncSecretsNetlify = async ({
  integration,
  integrationAuth,
  secrets,
  accessToken
}: {
  integration: TIntegrations;
  integrationAuth: TIntegrationAuths;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  interface NetlifyValue {
    id?: string;
    context: string; // 'dev' | 'branch-deploy' | 'deploy-preview' | 'production',
    value: string;
  }

  interface NetlifySecret {
    key: string;
    values: NetlifyValue[];
  }

  const getParams = new URLSearchParams({
    context_name: "all", // integration.context or all
    site_id: integration.appId as string
  });

  const res = (
    await request.get<NetlifySecret[]>(
      `${IntegrationUrls.NETLIFY_API_URL}/api/v1/accounts/${integrationAuth.accountId}/env`,
      {
        params: getParams,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    )
  ).data.reduce(
    (obj, secret) => ({
      ...obj,
      [secret.key]: secret
    }),
    {} as Record<string, NetlifySecret>
  );

  const newSecrets: NetlifySecret[] = []; // createEnvVars
  const deleteSecrets: string[] = []; // deleteEnvVar
  const deleteSecretValues: NetlifySecret[] = []; // deleteEnvVarValue
  const updateSecrets: NetlifySecret[] = []; // setEnvVarValue

  // identify secrets to create and update
  Object.keys(secrets).forEach((key) => {
    if (!(key in res)) {
      // case: Infisical secret does not exist in Netlify -> create secret
      newSecrets.push({
        key,
        values: [
          {
            value: secrets[key].value,
            context: integration.targetEnvironment as string
          }
        ]
      });
    } else {
      // case: Infisical secret exists in Netlify
      const contexts = res[key].values.reduce(
        (obj, value) => ({
          ...obj,
          [value.context]: value
        }),
        {} as Record<string, NetlifyValue>
      );

      if ((integration.targetEnvironment as string) in contexts) {
        // case: Netlify secret value exists in integration context
        if (secrets[key].value !== contexts[integration.targetEnvironment as string].value) {
          // case: Infisical and Netlify secret values are different
          // -> update Netlify secret context and value
          updateSecrets.push({
            key,
            values: [
              {
                context: integration.targetEnvironment as string,
                value: secrets[key].value
              }
            ]
          });
        }
      } else {
        // case: Netlify secret value does not exist in integration context
        // -> add the new Netlify secret context and value
        updateSecrets.push({
          key,
          values: [
            {
              context: integration.targetEnvironment as string,
              value: secrets[key].value
            }
          ]
        });
      }
    }
  });

  // identify secrets to delete
  // TODO: revise (patch case where 1 context was deleted but others still there
  Object.keys(res).forEach((key) => {
    // loop through each key's context
    if (!(key in secrets)) {
      // case: Netlify secret does not exist in Infisical

      const numberOfValues = res[key].values.length;

      res[key].values.forEach((value: NetlifyValue) => {
        if (value.context === integration.targetEnvironment) {
          if (numberOfValues <= 1) {
            // case: Netlify secret value has less than 1 context -> delete secret
            deleteSecrets.push(key);
          } else {
            // case: Netlify secret value has more than 1 context -> delete secret value context
            deleteSecretValues.push({
              key,
              values: [
                {
                  id: value.id,
                  context: integration.targetEnvironment,
                  value: value.value
                }
              ]
            });
          }
        }
      });
    }
  });

  const syncParams = new URLSearchParams({
    site_id: integration.appId as string
  });

  if (newSecrets.length > 0) {
    await request.post(
      `${IntegrationUrls.NETLIFY_API_URL}/api/v1/accounts/${integrationAuth.accountId}/env`,
      newSecrets,
      {
        params: syncParams,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );
  }

  if (updateSecrets.length > 0) {
    await Promise.all(
      updateSecrets.map(async (secret: NetlifySecret) => {
        await request.patch(
          `${IntegrationUrls.NETLIFY_API_URL}/api/v1/accounts/${integrationAuth.accountId}/env/${secret.key}`,
          {
            context: secret.values[0].context,
            value: secret.values[0].value
          },
          {
            params: syncParams,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Accept-Encoding": "application/json"
            }
          }
        );
      })
    );
  }

  if (deleteSecrets.length > 0) {
    await Promise.all(
      deleteSecrets.map(async (key: string) => {
        await request.delete(
          `${IntegrationUrls.NETLIFY_API_URL}/api/v1/accounts/${integrationAuth.accountId}/env/${key}`,
          {
            params: syncParams,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Accept-Encoding": "application/json"
            }
          }
        );
      })
    );
  }

  if (deleteSecretValues.length > 0) {
    await Promise.all(
      deleteSecretValues.map(async (secret: NetlifySecret) => {
        await request.delete(
          `${IntegrationUrls.NETLIFY_API_URL}/api/v1/accounts/${integrationAuth.accountId}/env/${secret.key}/value/${secret.values[0].id}`,
          {
            params: syncParams,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Accept-Encoding": "application/json"
            }
          }
        );
      })
    );
  }
};

/**
 * Sync/push [secrets] to GitHub repo with name [integration.app]
 */
const syncSecretsGitHub = async ({
  integration,
  secrets,
  accessToken,
  appendices
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
  appendices?: { prefix: string; suffix: string };
}) => {
  interface GitHubRepoKey {
    key_id: string;
    key: string;
    id?: number | undefined;
    url?: string | undefined;
    title?: string | undefined;
    created_at?: string | undefined;
  }

  interface GitHubSecret {
    name: string;
    created_at: string;
    updated_at: string;
    visibility?: "all" | "private" | "selected";
    selected_repositories_url?: string | undefined;
  }

  const octokit = new Octokit({
    auth: accessToken
  });

  enum GithubScope {
    Repo = "github-repo",
    Org = "github-org",
    Env = "github-env"
  }

  let repoPublicKey: GitHubRepoKey;

  switch (integration.scope) {
    case GithubScope.Org: {
      const { data } = await octokit.request("GET /orgs/{org}/actions/secrets/public-key", {
        org: integration.owner as string
      });
      repoPublicKey = data;
      break;
    }
    case GithubScope.Env: {
      const { data } = await octokit.request(
        "GET /repositories/{repository_id}/environments/{environment_name}/secrets/public-key",
        {
          repository_id: Number(integration.appId),
          environment_name: integration.targetEnvironmentId as string
        }
      );
      repoPublicKey = data;
      break;
    }
    default: {
      const { data } = await octokit.request("GET /repos/{owner}/{repo}/actions/secrets/public-key", {
        owner: integration.owner as string,
        repo: integration.app as string
      });
      repoPublicKey = data;
      break;
    }
  }

  // Get local copy of decrypted secrets. We cannot decrypt them as we dont have access to GH private key
  let encryptedSecrets: GitHubSecret[];

  switch (integration.scope) {
    case GithubScope.Org: {
      encryptedSecrets = (
        await octokit.request("GET /orgs/{org}/actions/secrets", {
          org: integration.owner as string
        })
      ).data.secrets;
      break;
    }
    case GithubScope.Env: {
      encryptedSecrets = (
        await octokit.request("GET /repositories/{repository_id}/environments/{environment_name}/secrets", {
          repository_id: Number(integration.appId),
          environment_name: integration.targetEnvironmentId as string
        })
      ).data.secrets;
      break;
    }
    default: {
      encryptedSecrets = (
        await octokit.request("GET /repos/{owner}/{repo}/actions/secrets", {
          owner: integration.owner as string,
          repo: integration.app as string
        })
      ).data.secrets;
      break;
    }
  }

  const metadata = IntegrationMetadataSchema.parse(integration.metadata);
  if (metadata.shouldEnableDelete) {
    for await (const encryptedSecret of encryptedSecrets) {
      if (
        !(encryptedSecret.name in secrets) &&
        !(appendices?.prefix !== undefined && !encryptedSecret.name.startsWith(appendices?.prefix)) &&
        !(appendices?.suffix !== undefined && !encryptedSecret.name.endsWith(appendices?.suffix))
      ) {
        switch (integration.scope) {
          case GithubScope.Org: {
            await octokit.request("DELETE /orgs/{org}/actions/secrets/{secret_name}", {
              org: integration.owner as string,
              secret_name: encryptedSecret.name
            });
            break;
          }
          case GithubScope.Env: {
            await octokit.request(
              "DELETE /repositories/{repository_id}/environments/{environment_name}/secrets/{secret_name}",
              {
                repository_id: Number(integration.appId),
                environment_name: integration.targetEnvironmentId as string,
                secret_name: encryptedSecret.name
              }
            );
            break;
          }
          default: {
            await octokit.request("DELETE /repos/{owner}/{repo}/actions/secrets/{secret_name}", {
              owner: integration.owner as string,
              repo: integration.app as string,
              secret_name: encryptedSecret.name
            });
            break;
          }
        }
      }
    }
  }

  await sodium.ready.then(async () => {
    for await (const key of Object.keys(secrets)) {
      // convert secret & base64 key to Uint8Array.
      const binkey = sodium.from_base64(repoPublicKey.key, sodium.base64_variants.ORIGINAL);
      const binsec = sodium.from_string(secrets[key].value);

      // encrypt secret using libsodium
      const encBytes = sodium.crypto_box_seal(binsec, binkey);

      // convert encrypted Uint8Array to base64
      const encryptedSecret = sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL);

      switch (integration.scope) {
        case GithubScope.Org:
          await octokit.request("PUT /orgs/{org}/actions/secrets/{secret_name}", {
            org: integration.owner as string,
            secret_name: key,
            visibility: "all",
            encrypted_value: encryptedSecret,
            key_id: repoPublicKey.key_id
          });
          break;
        case GithubScope.Env:
          await octokit.request(
            "PUT /repositories/{repository_id}/environments/{environment_name}/secrets/{secret_name}",
            {
              repository_id: Number(integration.appId),
              environment_name: integration.targetEnvironmentId as string,
              secret_name: key,
              encrypted_value: encryptedSecret,
              key_id: repoPublicKey.key_id
            }
          );
          break;
        default:
          await octokit.request("PUT /repos/{owner}/{repo}/actions/secrets/{secret_name}", {
            owner: integration.owner as string,
            repo: integration.app as string,
            secret_name: key,
            encrypted_value: encryptedSecret,
            key_id: repoPublicKey.key_id
          });
          break;
      }
    }
  });
};

/**
 * Sync/push [secrets] to Render service with id [integration.appId]
 */
const syncSecretsRender = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  await request.put(
    `${IntegrationUrls.RENDER_API_URL}/v1/services/${integration.appId}/env-vars`,
    Object.keys(secrets).map((key) => ({
      key,
      value: secrets[key].value
    })),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    }
  );

  if (integration.metadata) {
    const metadata = z.record(z.any()).parse(integration.metadata);
    if (metadata.shouldAutoRedeploy === true) {
      await request.post(
        `${IntegrationUrls.RENDER_API_URL}/v1/services/${integration.appId}/deploys`,
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        }
      );
    }
  }
};

/**
 * Sync/push [secrets] to Laravel Forge sites with id [integration.appId]
 */
const syncSecretsLaravelForge = async ({
  integration,
  secrets,
  accessId,
  accessToken
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessId: string | null;
  accessToken: string;
}) => {
  function transformObjectToString(obj: Record<string, { value: string }>) {
    let result = "";
    Object.keys(obj).forEach((key) => {
      result += `${key}=${obj[key].value}\n`;
    });
    return result;
  }

  await request.put(
    `${IntegrationUrls.LARAVELFORGE_API_URL}/api/v1/servers/${accessId}/sites/${integration.appId}/env`,
    {
      content: transformObjectToString(secrets)
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      }
    }
  );
};

/**
 * Sync/push [secrets] to Railway project with id [integration.appId]
 */
const syncSecretsRailway = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  const query = `
    mutation UpsertVariables($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }
  `;

  const variables = {
    input: {
      projectId: integration.appId,
      environmentId: integration.targetEnvironmentId,
      ...(integration.targetServiceId ? { serviceId: integration.targetServiceId } : {}),
      replace: true,
      variables: getSecretKeyValuePair(secrets)
    }
  };

  await request.post(
    IntegrationUrls.RAILWAY_API_URL,
    {
      query,
      variables
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept-Encoding": "application/json"
      }
    }
  );
};

/**
 * Sync/push [secrets] to Fly.io app
 */
const syncSecretsFlyio = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  // set secrets
  const SetSecrets = `
    mutation($input: SetSecretsInput!) {
      setSecrets(input: $input) {
        release {
          id
          version
          reason
          description
          user {
            id
            email
            name
          }
          evaluationId
          createdAt
        }
      }
    }
  `;

  await request.post(
    IntegrationUrls.FLYIO_API_URL,
    {
      query: SetSecrets,
      variables: {
        input: {
          appId: integration.app,
          secrets: Object.entries(secrets).map(([key, data]) => ({
            key,
            value: data.value
          }))
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    }
  );

  // get secrets
  interface FlyioSecret {
    name: string;
    digest: string;
    createdAt: string;
  }

  const GetSecrets = `query ($appName: String!) {
      app(name: $appName) {
          secrets {
              name
              digest
              createdAt
          }
      }
  }`;

  const getSecretsRes = (
    await request.post<{ data: { app: { secrets: FlyioSecret[] } } }>(
      IntegrationUrls.FLYIO_API_URL,
      {
        query: GetSecrets,
        variables: {
          appName: integration.app
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Accept-Encoding": "application/json"
        }
      }
    )
  ).data.data.app.secrets;

  const deleteSecretsKeys = getSecretsRes.filter((secret) => !(secret.name in secrets)).map((secret) => secret.name);

  // unset (delete) secrets
  const DeleteSecrets = `mutation($input: UnsetSecretsInput!) {
      unsetSecrets(input: $input) {
          release {
              id
              version
              reason
              description
              user {
                  id
                  email
                  name
              }
              evaluationId
              createdAt
          }
      }
  }`;

  await request.post(
    IntegrationUrls.FLYIO_API_URL,
    {
      query: DeleteSecrets,
      variables: {
        input: {
          appId: integration.app,
          keys: deleteSecretsKeys
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept-Encoding": "application/json"
      }
    }
  );
};

/**
 * Sync/push [secrets] to CircleCI project
 */
const syncSecretsCircleCI = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  const circleciOrganizationDetail = (
    await request.get(`${IntegrationUrls.CIRCLECI_API_URL}/v2/me/collaborations`, {
      headers: {
        "Circle-Token": accessToken,
        "Accept-Encoding": "application/json"
      }
    })
  ).data[0];

  const { slug } = circleciOrganizationDetail;

  // sync secrets to CircleCI
  await Promise.all(
    Object.keys(secrets).map(async (key) =>
      request.post(
        `${IntegrationUrls.CIRCLECI_API_URL}/v2/project/${slug}/${integration.app}/envvar`,
        {
          name: key,
          value: secrets[key].value
        },
        {
          headers: {
            "Circle-Token": accessToken,
            "Content-Type": "application/json"
          }
        }
      )
    )
  );

  // get secrets from CircleCI
  const getSecretsRes = (
    await request.get<{ items: { name: string }[] }>(
      `${IntegrationUrls.CIRCLECI_API_URL}/v2/project/${slug}/${integration.app}/envvar`,
      {
        headers: {
          "Circle-Token": accessToken,
          "Accept-Encoding": "application/json"
        }
      }
    )
  ).data?.items;

  // delete secrets from CircleCI
  await Promise.all(
    getSecretsRes.map(async (sec) => {
      if (!(sec.name in secrets)) {
        return request.delete(
          `${IntegrationUrls.CIRCLECI_API_URL}/v2/project/${slug}/${integration.app}/envvar/${sec.name}`,
          {
            headers: {
              "Circle-Token": accessToken,
              "Content-Type": "application/json"
            }
          }
        );
      }
    })
  );
};

/**
 * Sync/push [secrets] to TravisCI project
 */
const syncSecretsTravisCI = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  // get secrets from travis-ci
  const getSecretsRes = (
    await request.get<{
      env_vars: { name: string; value: string; repository_id: string; id: string }[];
    }>(`${IntegrationUrls.TRAVISCI_API_URL}/settings/env_vars?repository_id=${integration.appId}`, {
      headers: {
        Authorization: `token ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    })
  ).data?.env_vars.reduce(
    (obj, secret) => ({
      ...obj,
      [secret.name]: secret
    }),
    {} as Record<string, { name: string; value: string; repository_id: string; id: string }>
  );

  // add secrets
  for await (const key of Object.keys(secrets)) {
    if (!(key in getSecretsRes)) {
      // case: secret does not exist in travis ci
      // -> add secret
      await request.post(
        `${IntegrationUrls.TRAVISCI_API_URL}/settings/env_vars?repository_id=${integration.appId}`,
        {
          env_var: {
            name: key,
            value: secrets[key].value
          }
        },
        {
          headers: {
            Authorization: `token ${accessToken}`,
            "Content-Type": "application/json",
            "Accept-Encoding": "application/json"
          }
        }
      );
    } else {
      // case: secret exists in travis ci
      // -> update/set secret
      await request.patch(
        `${IntegrationUrls.TRAVISCI_API_URL}/settings/env_vars/${getSecretsRes[key].id}?repository_id=${getSecretsRes[key].repository_id}`,
        {
          env_var: {
            name: key,
            value: secrets[key].value
          }
        },
        {
          headers: {
            Authorization: `token ${accessToken}`,
            "Content-Type": "application/json",
            "Accept-Encoding": "application/json"
          }
        }
      );
    }
  }

  for await (const key of Object.keys(getSecretsRes)) {
    if (!(key in secrets)) {
      // delete secret
      await request.delete(
        `${IntegrationUrls.TRAVISCI_API_URL}/settings/env_vars/${getSecretsRes[key].id}?repository_id=${getSecretsRes[key].repository_id}`,
        {
          headers: {
            Authorization: `token ${accessToken}`,
            "Content-Type": "application/json",
            "Accept-Encoding": "application/json"
          }
        }
      );
    }
  }
};

/**
 * Sync/push [secrets] to GitLab repo with name [integration.app]
 */
const syncSecretsGitLab = async ({
  integrationAuth,
  integration,
  secrets,
  accessToken
}: {
  integrationAuth: TIntegrationAuths;
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  interface GitLabSecret {
    key: string;
    value: string;
    environment_scope: string;
  }

  const gitLabApiUrl = integrationAuth.url ? `${integrationAuth.url}/api` : IntegrationUrls.GITLAB_API_URL;

  const getAllEnvVariables = async (integrationAppId: string, accToken: string) => {
    const headers = {
      Authorization: `Bearer ${accToken}`,
      "Accept-Encoding": "application/json",
      "Content-Type": "application/json"
    };

    let allEnvVariables: GitLabSecret[] = [];
    let url: string | null = `${gitLabApiUrl}/v4/projects/${integrationAppId}/variables?per_page=100`;

    while (url) {
      const response = await request.get(url, { headers });
      allEnvVariables = [...allEnvVariables, ...response.data];

      const linkHeader = response.headers.link as string;
      const nextLink = linkHeader?.split(",").find((part: string) => part.includes('rel="next"'));

      if (nextLink) {
        url = nextLink.trim().split(";")[0].slice(1, -1);
      } else {
        url = null;
      }
    }

    return allEnvVariables;
  };

  const metadata = IntegrationMetadataSchema.parse(integration.metadata);
  const allEnvVariables = await getAllEnvVariables(integration?.appId as string, accessToken);
  const getSecretsRes: GitLabSecret[] = allEnvVariables
    .filter((secret: GitLabSecret) => secret.environment_scope === integration.targetEnvironment)
    .filter((gitLabSecret) => {
      let isValid = true;

      if (metadata.secretPrefix && !gitLabSecret.key.startsWith(metadata.secretPrefix)) {
        isValid = false;
      }

      if (metadata.secretSuffix && !gitLabSecret.key.endsWith(metadata.secretSuffix)) {
        isValid = false;
      }

      return isValid;
    });

  for await (const key of Object.keys(secrets)) {
    const existingSecret = getSecretsRes.find((s) => s.key === key);
    if (!existingSecret) {
      await request.post(
        `${gitLabApiUrl}/v4/projects/${integration?.appId}/variables`,
        {
          key,
          value: secrets[key].value,
          protected: Boolean(metadata.shouldProtectSecrets),
          masked: Boolean(metadata.shouldMaskSecrets),
          raw: false,
          environment_scope: integration.targetEnvironment
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Accept-Encoding": "application/json"
          }
        }
      );
    } else if (secrets[key].value !== existingSecret.value) {
      await request.put(
        `${gitLabApiUrl}/v4/projects/${integration?.appId}/variables/${existingSecret.key}?filter[environment_scope]=${integration.targetEnvironment}`,
        {
          ...existingSecret,
          value: secrets[existingSecret.key].value,
          protected: Boolean(metadata.shouldProtectSecrets),
          masked: Boolean(metadata.shouldMaskSecrets)
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Accept-Encoding": "application/json"
          }
        }
      );
    }
  }

  // delete secrets
  for await (const sec of getSecretsRes) {
    if (!(sec.key in secrets)) {
      await request.delete(
        `${gitLabApiUrl}/v4/projects/${integration?.appId}/variables/${sec.key}?filter[environment_scope]=${integration.targetEnvironment}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );
    }
  }
};

/**
 * Sync/push [secrets] to Supabase with name [integration.app]
 */
const syncSecretsSupabase = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  const { data: getSecretsRes } = await request.get<{ name: string; value: string }[]>(
    `${IntegrationUrls.SUPABASE_API_URL}/v1/projects/${integration.appId}/secrets`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    }
  );

  // convert the secrets to [{}] format
  const modifiedFormatForSecretInjection = Object.keys(secrets).map((key) => ({
    name: key,
    value: secrets[key].value
  }));

  await request.post(
    `${IntegrationUrls.SUPABASE_API_URL}/v1/projects/${integration.appId}/secrets`,
    modifiedFormatForSecretInjection,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    }
  );

  const secretsToDelete = getSecretsRes?.flatMap((secretObj) => {
    if (
      !(secretObj.name in secrets) &&
      // supbase reserved secret ref: https://supabase.com/docs/guides/functions/secrets#default-secrets
      !["SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL", "SUPABASE_URL"].includes(secretObj.name)
    ) {
      return secretObj.name;
    }
    return [];
  });

  await request.delete(`${IntegrationUrls.SUPABASE_API_URL}/v1/projects/${integration.appId}/secrets`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Accept-Encoding": "application/json"
    },
    data: secretsToDelete
  });
};

/**
 * Sync/push [secrets] to Checkly app/group
 */
const syncSecretsCheckly = async ({
  integration,
  secrets,
  accessToken,
  appendices
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
  appendices?: { prefix: string; suffix: string };
}) => {
  if (integration.targetServiceId) {
    // sync secrets to checkly group envars

    let getGroupSecretsRes = (
      await request.get<{ environmentVariables: { key: string; value: string }[] }>(
        `${IntegrationUrls.CHECKLY_API_URL}/v1/check-groups/${integration.targetServiceId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
            "X-Checkly-Account": integration.appId
          }
        }
      )
    ).data.environmentVariables.reduce(
      (obj, secret) => ({
        ...obj,
        [secret.key]: secret.value
      }),
      {} as Record<string, string>
    );

    getGroupSecretsRes = Object.keys(getGroupSecretsRes).reduce(
      (
        result: {
          [key: string]: string;
        },
        key
      ) => {
        if (
          (appendices?.prefix !== undefined ? key.startsWith(appendices?.prefix) : true) &&
          (appendices?.suffix !== undefined ? key.endsWith(appendices?.suffix) : true)
        ) {
          result[key] = getGroupSecretsRes[key];
        }
        return result;
      },
      {}
    );

    const groupEnvironmentVariables = Object.keys(secrets).map((key) => ({
      key,
      value: secrets[key].value
    }));

    await request.put(
      `${IntegrationUrls.CHECKLY_API_URL}/v1/check-groups/${integration.targetServiceId}`,
      {
        environmentVariables: groupEnvironmentVariables
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "X-Checkly-Account": integration.appId
        }
      }
    );
  } else {
    // sync secrets to checkly global envars

    let getSecretsRes = (
      await request.get<{ key: string; value: string }[]>(`${IntegrationUrls.CHECKLY_API_URL}/v1/variables`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json",
          "X-Checkly-Account": integration.appId
        }
      })
    ).data.reduce(
      (obj, secret) => ({
        ...obj,
        [secret.key]: secret.value
      }),
      {} as Record<string, string>
    );

    getSecretsRes = Object.keys(getSecretsRes).reduce(
      (
        result: {
          [key: string]: string;
        },
        key
      ) => {
        if (
          (appendices?.prefix !== undefined ? key.startsWith(appendices?.prefix) : true) &&
          (appendices?.suffix !== undefined ? key.endsWith(appendices?.suffix) : true)
        ) {
          result[key] = getSecretsRes[key];
        }
        return result;
      },
      {}
    );

    // add secrets
    for await (const key of Object.keys(secrets)) {
      if (!(key in getSecretsRes)) {
        // case: secret does not exist in checkly
        // -> add secret
        await request.post(
          `${IntegrationUrls.CHECKLY_API_URL}/v1/variables`,
          {
            key,
            value: secrets[key].value
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json",
              "Content-Type": "application/json",
              "X-Checkly-Account": integration.appId
            }
          }
        );
        // case: secret exists in checkly
        // -> update/set secret
      } else if (secrets[key].value !== getSecretsRes[key]) {
        await request.put(
          `${IntegrationUrls.CHECKLY_API_URL}/v1/variables/${key}`,
          {
            value: secrets[key].value
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              Accept: "application/json",
              "X-Checkly-Account": integration.appId
            }
          }
        );
      }

      for await (const getSecKey of Object.keys(getSecretsRes)) {
        if (!(getSecKey in secrets)) {
          // delete secret
          await request.delete(`${IntegrationUrls.CHECKLY_API_URL}/v1/variables/${getSecKey}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json",
              "X-Checkly-Account": integration.appId
            }
          });
        }
      }
    }
  }
};

/**
 * Sync/push [secrets] to Qovery app
 * @param {Object} obj
 * @param {TIntegrations} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for Qovery integration
 */
const syncSecretsQovery = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  const getSecretsRes = (
    await request.get<{ results: { id: string; value: string; key: string }[] }>(
      `${IntegrationUrls.QOVERY_API_URL}/${integration.scope}/${integration.appId}/environmentVariable`,
      {
        headers: {
          Authorization: `Token ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    )
  ).data.results.reduce(
    (obj, secret) => ({
      ...obj,
      [secret.key]: { id: secret.id, value: secret.value }
    }),
    {} as Record<string, { id: string; value: string }>
  );

  // add secrets
  for await (const key of Object.keys(secrets)) {
    if (!(key in getSecretsRes)) {
      // case: secret does not exist in qovery
      // -> add secret
      await request.post(
        `${IntegrationUrls.QOVERY_API_URL}/${integration.scope}/${integration.appId}/environmentVariable`,
        {
          key,
          value: secrets[key].value
        },
        {
          headers: {
            Authorization: `Token ${accessToken}`,
            Accept: "application/json",
            "Content-Type": "application/json"
          }
        }
      );
      // case: secret exists in qovery
      // -> update/set secret
    } else if (secrets[key].value !== getSecretsRes[key].value) {
      await request.put(
        `${IntegrationUrls.QOVERY_API_URL}/${integration.scope}/${integration.appId}/environmentVariable/${getSecretsRes[key].id}`,
        {
          key,
          value: secrets[key].value
        },
        {
          headers: {
            Authorization: `Token ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json"
          }
        }
      );
    }
  }

  // This one is dangerous because there might be a lot of qovery-specific secrets

  // for await (const key of Object.keys(getSecretsRes)) {
  //   if (!(key in secrets)) {
  //     console.log(3)
  //     // delete secret
  //     await request.delete(`${IntegrationUrls.QOVERY_API_URL}/application/${integration.appId}/environmentVariable/${getSecretsRes[key].id}`, {
  //       headers: {
  //         Authorization: `Token ${accessToken}`,
  //         Accept: "application/json",
  //         "X-Qovery-Account": integration.appId
  //       }
  //     });
  //   }
  // }
};

/**
 * Sync/push [secrets] to Terraform Cloud project with id [integration.appId]
 * @param {Object} obj
 * @param {TIntegrations} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for Terraform Cloud API
 */
const syncSecretsTerraformCloud = async ({
  createManySecretsRawFn,
  updateManySecretsRawFn,
  integration,
  secrets,
  accessToken,
  integrationDAL
}: {
  createManySecretsRawFn: (params: TCreateManySecretsRawFn) => Promise<Array<{ id: string }>>;
  updateManySecretsRawFn: (params: TUpdateManySecretsRawFn) => Promise<Array<{ id: string }>>;
  integration: TIntegrations & {
    projectId: string;
    environment: {
      id: string;
      name: string;
      slug: string;
    };
  };
  secrets: Record<string, { value: string; comment?: string } | null>;
  accessToken: string;
  integrationDAL: Pick<TIntegrationDALFactory, "updateById">;
}) => {
  // get secrets from Terraform Cloud
  const terraformSecrets = (
    await request.get<{ data: { attributes: { key: string; value: string }; id: string }[] }>(
      `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/workspaces/${integration.appId}/vars`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      }
    )
  ).data.data.reduce(
    (obj, secret) => ({
      ...obj,
      [secret.attributes.key]: secret
    }),
    {} as Record<string, { attributes: { key: string; value: string }; id: string }>
  );

  const secretsToAdd: { [key: string]: string } = {};
  const secretsToUpdate: { [key: string]: string } = {};

  const metadata = z.record(z.any()).parse(integration.metadata);

  Object.keys(terraformSecrets).forEach((key) => {
    if (!integration.lastUsed) {
      // first time using integration
      // -> apply initial sync behavior
      switch (metadata.initialSyncBehavior) {
        case IntegrationInitialSyncBehavior.PREFER_TARGET: {
          if (!(key in secrets)) {
            secretsToAdd[key] = terraformSecrets[key].attributes.value;
          } else if (secrets[key]?.value !== terraformSecrets[key].attributes.value) {
            secretsToUpdate[key] = terraformSecrets[key].attributes.value;
          }
          secrets[key] = {
            value: terraformSecrets[key].attributes.value
          };
          break;
        }
        case IntegrationInitialSyncBehavior.PREFER_SOURCE: {
          if (!(key in secrets)) {
            secrets[key] = {
              value: terraformSecrets[key].attributes.value
            };
            secretsToAdd[key] = terraformSecrets[key].attributes.value;
          }
          break;
        }
        default: {
          break;
        }
      }
    } else if (!(key in secrets)) secrets[key] = null;
  });

  if (Object.keys(secretsToAdd).length) {
    await createManySecretsRawFn({
      projectId: integration.projectId,
      environment: integration.environment.slug,
      path: integration.secretPath,
      secrets: Object.keys(secretsToAdd).map((key) => ({
        secretName: key,
        secretValue: secretsToAdd[key],
        type: SecretType.Shared,
        secretComment: ""
      }))
    });
  }

  if (Object.keys(secretsToUpdate).length) {
    await updateManySecretsRawFn({
      projectId: integration.projectId,
      environment: integration.environment.slug,
      path: integration.secretPath,
      secrets: Object.keys(secretsToUpdate).map((key) => ({
        secretName: key,
        secretValue: secretsToUpdate[key],
        type: SecretType.Shared,
        secretComment: ""
      }))
    });
  }

  // create or update secrets on Terraform Cloud
  for await (const key of Object.keys(secrets)) {
    if (!(key in terraformSecrets)) {
      // case: secret does not exist in Terraform Cloud
      // -> add secret
      await request.post(
        `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/workspaces/${integration.appId}/vars`,
        {
          data: {
            type: "vars",
            attributes: {
              key,
              value: secrets[key]?.value,
              category: integration.targetService
            }
          }
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/vnd.api+json",
            Accept: "application/vnd.api+json"
          }
        }
      );
      // case: secret exists in Terraform Cloud
    } else if (secrets[key]?.value !== terraformSecrets[key].attributes.value) {
      // -> update secret
      await request.patch(
        `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/workspaces/${integration.appId}/vars/${terraformSecrets[key].id}`,
        {
          data: {
            type: "vars",
            id: terraformSecrets[key].id,
            attributes: {
              ...terraformSecrets[key],
              value: secrets[key]?.value
            }
          }
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/vnd.api+json",
            Accept: "application/vnd.api+json"
          }
        }
      );
    }
  }

  for await (const key of Object.keys(terraformSecrets)) {
    if (!(key in secrets)) {
      // case: delete secret
      await request.delete(
        `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/workspaces/${integration.appId}/vars/${terraformSecrets[key].id}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/vnd.api+json",
            Accept: "application/vnd.api+json"
          }
        }
      );
    }
  }

  await integrationDAL.updateById(integration.id, {
    lastUsed: new Date()
  });
};

/**
 * Sync/push [secrets] to TeamCity project (and optionally build config)
 */
const syncSecretsTeamCity = async ({
  integrationAuth,
  integration,
  secrets,
  accessToken
}: {
  integrationAuth: TIntegrationAuths;
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  interface TeamCitySecret {
    name: string;
    value: string;
  }

  interface TeamCityBuildConfigParameter {
    name: string;
    value: string;
    inherited: boolean;
  }
  interface GetTeamCityBuildConfigParametersRes {
    href: string;
    count: number;
    property: TeamCityBuildConfigParameter[];
  }

  if (integration.targetEnvironment && integration.targetEnvironmentId) {
    // case: sync to specific build-config in TeamCity project
    const res = (
      await request.get<GetTeamCityBuildConfigParametersRes>(
        `${integrationAuth.url}/app/rest/buildTypes/${integration.targetEnvironmentId}/parameters`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
          }
        }
      )
    ).data.property
      .filter((parameter) => !parameter.inherited)
      .reduce(
        (obj, secret) => {
          const secretName = secret.name.replace(/^env\./, "");
          return {
            ...obj,
            [secretName]: secret.value
          };
        },
        {} as Record<string, string>
      );

    for await (const key of Object.keys(secrets)) {
      if (!(key in res) || (key in res && secrets[key].value !== res[key])) {
        // case: secret does not exist in TeamCity or secret value has changed
        // -> create/update secret
        await request.post(
          `${integrationAuth.url}/app/rest/buildTypes/${integration.targetEnvironmentId}/parameters`,
          {
            name: `env.${key}`,
            value: secrets[key].value
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json"
            }
          }
        );
      }
    }

    for await (const key of Object.keys(res)) {
      if (!(key in secrets)) {
        // delete secret
        await request.delete(
          `${integrationAuth.url}/app/rest/buildTypes/${integration.targetEnvironmentId}/parameters/env.${key}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json"
            }
          }
        );
      }
    }
  } else {
    // case: sync to TeamCity project
    const res = (
      await request.get<{ property: TeamCitySecret[] }>(
        `${integrationAuth.url}/app/rest/projects/id:${integration.appId}/parameters`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
          }
        }
      )
    ).data.property.reduce(
      (obj, secret) => {
        const secretName = secret.name.replace(/^env\./, "");
        return {
          ...obj,
          [secretName]: secret.value
        };
      },
      {} as Record<string, string>
    );

    for await (const key of Object.keys(secrets)) {
      if (!(key in res) || (key in res && secrets[key].value !== res[key])) {
        // case: secret does not exist in TeamCity or secret value has changed
        // -> create/update secret
        await request.post(
          `${integrationAuth.url}/app/rest/projects/id:${integration.appId}/parameters`,
          {
            name: `env.${key}`,
            value: secrets[key].value
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json"
            }
          }
        );
      }
    }

    for await (const key of Object.keys(res)) {
      if (!(key in secrets)) {
        // delete secret
        await request.delete(`${integrationAuth.url}/app/rest/projects/id:${integration.appId}/parameters/env.${key}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
          }
        });
      }
    }
  }
};

/**
 * Sync/push [secrets] to HashiCorp Vault path
 */
const syncSecretsHashiCorpVault = async ({
  integration,
  integrationAuth,
  secrets,
  accessId,
  accessToken
}: {
  integration: TIntegrations;
  integrationAuth: TIntegrationAuths;
  secrets: Record<string, { value: string; comment?: string }>;
  accessId: string | null;
  accessToken: string;
}) => {
  if (!accessId) {
    throw new Error("Access ID is required");
  }

  interface LoginAppRoleRes {
    auth: {
      client_token: string;
    };
  }

  // get Vault client token (could be optimized)
  const { data }: { data: LoginAppRoleRes } = await request.post(
    `${integrationAuth.url}/v1/auth/approle/login`,
    {
      role_id: accessId,
      secret_id: accessToken
    },
    {
      headers: {
        "X-Vault-Namespace": integrationAuth.namespace
      }
    }
  );

  const clientToken = data.auth.client_token;

  await request.post(
    `${integrationAuth.url}/v1/${integration.app}/data/${integration.path}`,
    {
      data: getSecretKeyValuePair(secrets)
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Vault-Token": clientToken,
        "X-Vault-Namespace": integrationAuth.namespace
      }
    }
  );
};

/**
 * Sync/push [secrets] to Cloudflare Pages project with name [integration.app]
 * @param {Object} obj
 * @param {TIntegrations} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - API token for Cloudflare
 */
const syncSecretsCloudflarePages = async ({
  integration,
  secrets,
  accessId,
  accessToken
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessId: string | null;
  accessToken: string;
}) => {
  // get secrets from cloudflare pages
  const getSecretsRes = (
    await request.get<{
      result: { deployment_configs: Record<string, { env_vars: Record<string, unknown> }> };
    }>(`${IntegrationUrls.CLOUDFLARE_PAGES_API_URL}/client/v4/accounts/${accessId}/pages/projects/${integration.app}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    })
  ).data.result.deployment_configs[integration.targetEnvironment as string].env_vars;

  let secretEntries: [string, object | null][] = Object.entries(getSecretKeyValuePair(secrets)).map(([key, val]) => [
    key,
    { type: "secret_text", value: val }
  ]);

  if (getSecretsRes) {
    const toDeleteKeys = Object.keys(getSecretsRes).filter((key) => !Object.keys(secrets).includes(key));
    const toDeleteEntries: [string, null][] = toDeleteKeys.map((key) => [key, null]);
    secretEntries = [...secretEntries, ...toDeleteEntries];
  }

  const data = {
    deployment_configs: {
      [integration.targetEnvironment as string]: {
        env_vars: Object.fromEntries(secretEntries)
      }
    }
  };

  await request.patch(
    `${IntegrationUrls.CLOUDFLARE_PAGES_API_URL}/client/v4/accounts/${accessId}/pages/projects/${integration.app}`,
    data,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    }
  );

  const metadata = z.record(z.any()).parse(integration.metadata);
  if (metadata.shouldAutoRedeploy) {
    await request.post(
      `${IntegrationUrls.CLOUDFLARE_PAGES_API_URL}/client/v4/accounts/${accessId}/pages/projects/${integration.app}/deployments`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      }
    );
  }
};

/**
 * Sync/push [secrets] to Cloudflare Workers project with name [integration.app]
 */
const syncSecretsCloudflareWorkers = async ({
  integration,
  secrets,
  accessId,
  accessToken
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessId: string | null;
  accessToken: string;
}) => {
  // get secrets from cloudflare workers
  const getSecretsRes = (
    await request.get<{ result: { name: string }[] }>(
      `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accessId}/workers/scripts/${integration.app}/secrets`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      }
    )
  ).data.result;

  const secretsObj = Object.fromEntries(
    Object.entries(getSecretKeyValuePair(secrets)).map(([key, val]) => [key, { type: "secret_text", value: val }])
  );

  // get deleted secrets list
  const deletedSecretKeys: string[] = [];
  if (getSecretsRes) {
    getSecretsRes.forEach((secretRes) => {
      if (!Object.keys(secrets).includes(secretRes.name)) {
        deletedSecretKeys.push(secretRes.name);
      }
    });
  }

  await Promise.all(
    deletedSecretKeys.map(async (secretKey) => {
      return request.delete(
        `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accessId}/workers/scripts/${integration.app}/secrets/${secretKey}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
          }
        }
      );
    })
  );

  interface ConvertedSecret {
    name: string;
    text: string;
    type: string;
  }

  interface SecretsObj {
    [key: string]: {
      type: string;
      value: string;
    };
  }

  const data: ConvertedSecret[] = Object.entries(secretsObj as SecretsObj).map(([name, secret]) => ({
    name,
    text: secret.value,
    type: "secret_text"
  }));

  await Promise.all(
    data.map(async (secret) => {
      return request.put(
        `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accessId}/workers/scripts/${integration.app}/secrets`,
        secret,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
          }
        }
      );
    })
  );
};

/**
 * Sync/push [secrets] to BitBucket repo with name [integration.app]
 */
const syncSecretsBitBucket = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  interface VariablesResponse {
    size: number;
    page: number;
    pageLen: number;
    next: string;
    previous: string;
    values: Array<BitbucketVariable>;
  }

  interface BitbucketVariable {
    type: string;
    uuid: string;
    key: string;
    value: string;
    secured: boolean;
  }

  const res: { [key: string]: BitbucketVariable } = {};

  let hasNextPage = true;
  let variablesUrl = `${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories/${integration.targetEnvironmentId}/${integration.appId}/pipelines_config/variables`;

  while (hasNextPage) {
    const { data }: { data: VariablesResponse } = await request.get(variablesUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });

    if (data?.values.length > 0) {
      data.values.forEach((variable) => {
        res[variable.key] = variable;
      });
    }

    if (data.next) {
      variablesUrl = data.next;
    } else {
      hasNextPage = false;
    }
  }

  for await (const key of Object.keys(secrets)) {
    if (key in res) {
      // update existing secret
      await request.put(
        `${variablesUrl}/${res[key].uuid}`,
        {
          key,
          value: secrets[key].value,
          secured: true
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
          }
        }
      );
    } else {
      // create new secret
      await request.post(
        variablesUrl,
        {
          key,
          value: secrets[key].value,
          secured: true
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
          }
        }
      );
    }
  }

  for await (const key of Object.keys(res)) {
    if (!(key in secrets)) {
      // delete secret
      await request.delete(`${variablesUrl}/${res[key].uuid}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      });
    }
  }
};

/**
 * Sync/push [secrets] to Codefresh project with name [integration.app]
 * @param {Object} obj
 * @param {TIntegrations} obj.integration - integration details
 * @param {TIntegrationAuth} obj.integrationAuth - integration auth details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for Codefresh integration
 */
const syncSecretsCodefresh = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  await request.patch(
    `${IntegrationUrls.CODEFRESH_API_URL}/projects/${integration.appId}`,
    {
      variables: Object.keys(secrets).map((key) => ({
        key,
        value: secrets[key].value
      }))
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    }
  );
};

/**
 * Sync/push [secrets] to DigitalOcean App Platform application with name [integration.app]
 * @param {Object} obj
 * @param {TIntegrations} obj.integration - integration details
 * @param {TIntegrationAuth} obj.integrationAuth - integration auth details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for integration
 */
const syncSecretsDigitalOceanAppPlatform = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  // get current app settings
  const appSettings = (
    await request.get(`${IntegrationUrls.DIGITAL_OCEAN_API_URL}/v2/apps/${integration.appId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    })
  ).data.app.spec;

  await request.put(
    `${IntegrationUrls.DIGITAL_OCEAN_API_URL}/v2/apps/${integration.appId}`,
    {
      spec: {
        name: integration.app,
        ...appSettings,
        envs: Object.entries(secrets).map(([key, data]) => ({ key, value: data.value, type: "SECRET" }))
      }
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    }
  );
};

/**
 * Sync/push [secrets] to Windmill with name [integration.app]
 * @param {Object} obj
 * @param {TIntegrations} obj.integration - integration details
 * @param {TIntegrationAuth} obj.integrationAuth - integration auth details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for windmill integration
 * @param {Object} obj.secretComments - secret comments to push to integration (object where keys are secret keys and values are comment values)
 */
const syncSecretsWindmill = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  interface WindmillSecret {
    path: string;
    value: string;
    is_secret: boolean;
    description?: string;
  }

  // get secrets stored in windmill workspace
  const res = (
    await request.get<WindmillSecret[]>(`${IntegrationUrls.WINDMILL_API_URL}/w/${integration.appId}/variables/list`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    })
  ).data.reduce(
    (obj, secret) => ({
      ...obj,
      [secret.path]: secret
    }),
    {} as Record<string, WindmillSecret>
  );

  // eslint-disable-next-line
  const pattern = new RegExp("^(u/|f/)[a-zA-Z0-9_-]+/([a-zA-Z0-9_-]+/)*[a-zA-Z0-9_-]*[^/]$");

  for await (const key of Object.keys(secrets)) {
    if ((key.startsWith("u/") || key.startsWith("f/")) && pattern.test(key)) {
      if (!(key in res)) {
        // case: secret does not exist in windmill
        // -> create secret

        await request.post(
          `${IntegrationUrls.WINDMILL_API_URL}/w/${integration.appId}/variables/create`,
          {
            path: key,
            value: secrets[key].value,
            is_secret: true,
            description: secrets[key]?.comment || ""
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Accept-Encoding": "application/json"
            }
          }
        );
      } else {
        // -> update secret
        await request.post(
          `${IntegrationUrls.WINDMILL_API_URL}/w/${integration.appId}/variables/update/${res[key].path}`,
          {
            path: key,
            value: secrets[key].value,
            is_secret: true,
            description: secrets[key]?.comment || ""
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Accept-Encoding": "application/json"
            }
          }
        );
      }
    }
  }

  for await (const key of Object.keys(res)) {
    if (!(key in secrets)) {
      // -> delete secret
      await request.delete(
        `${IntegrationUrls.WINDMILL_API_URL}/w/${integration.appId}/variables/delete/${res[key].path}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Accept-Encoding": "application/json"
          }
        }
      );
    }
  }
};

/**
 * Sync/push [secrets] to Cloud66 application with name [integration.app]
 */
const syncSecretsCloud66 = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  interface Cloud66Secret {
    id: number;
    key: string;
    value: string;
    readonly: boolean;
    created_at: string;
    updated_at: string;
    is_password: boolean;
    is_generated: boolean;
    history: unknown[];
  }

  // get all current secrets
  const res = (
    await request.get<{ response: Cloud66Secret[] }>(
      `${IntegrationUrls.CLOUD_66_API_URL}/3/stacks/${integration.appId}/environments`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      }
    )
  ).data.response
    .filter((secret) => !secret.readonly || !secret.is_generated)
    .reduce(
      (obj, secret) => ({
        ...obj,
        [secret.key]: secret
      }),
      {}
    );

  for await (const key of Object.keys(secrets)) {
    if (key in res) {
      // update existing secret
      await request.put(
        `${IntegrationUrls.CLOUD_66_API_URL}/3/stacks/${integration.appId}/environments/${key}`,
        {
          key,
          value: secrets[key].value
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
          }
        }
      );
    } else {
      // create new secret
      await request.post(
        `${IntegrationUrls.CLOUD_66_API_URL}/3/stacks/${integration.appId}/environments`,
        {
          key,
          value: secrets[key].value
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
          }
        }
      );
    }
  }

  for await (const key of Object.keys(res)) {
    if (!(key in secrets)) {
      // delete secret
      await request.delete(`${IntegrationUrls.CLOUD_66_API_URL}/3/stacks/${integration.appId}/environments/${key}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      });
    }
  }
};

/** Sync/push [secrets] to Northflank
 * @param {Object} obj
 * @param {TIntegrations} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for Northflank integration
 */
const syncSecretsNorthflank = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  await request.patch(
    `${IntegrationUrls.NORTHFLANK_API_URL}/v1/projects/${integration.appId}/secrets/${integration.targetServiceId}`,
    {
      secrets: {
        variables: getSecretKeyValuePair(secrets)
      }
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    }
  );
};

/** Sync/push [secrets] to Hasura Cloud
 * @param {Object} obj
 * @param {TIntegrations} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for Hasura Cloud integration
 */
const syncSecretsHasuraCloud = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  const res = await request.post(
    IntegrationUrls.HASURA_CLOUD_API_URL,
    {
      query: "query MyQuery($tenantId: uuid!) { getTenantEnv(tenantId: $tenantId) { hash envVars } }",
      variables: {
        tenantId: integration.appId
      }
    },
    {
      headers: {
        Authorization: `pat ${accessToken}`,
        "Content-Type": "application/json"
      }
    }
  );

  const {
    data: {
      getTenantEnv: { hash, envVars }
    }
  } = ZGetTenantEnv.parse(res.data);

  let currentHash = hash;

  const secretsToUpdate = Object.keys(secrets).map((key) => ({
    key,
    value: secrets[key].value
  }));

  if (secretsToUpdate.length) {
    // update secrets

    const addRequest = await request.post(
      IntegrationUrls.HASURA_CLOUD_API_URL,
      {
        query:
          "mutation MyQuery($currentHash: String!, $envs: [UpdateEnvObject!]!, $tenantId: uuid!) { updateTenantEnv(currentHash: $currentHash, envs: $envs, tenantId: $tenantId) { hash envVars} }",
        variables: {
          currentHash,
          envs: secretsToUpdate,
          tenantId: integration.appId
        }
      },
      {
        headers: {
          Authorization: `pat ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    const addRequestResponse = ZUpdateTenantEnv.safeParse(addRequest.data);
    if (addRequestResponse.success) {
      currentHash = addRequestResponse.data.data.updateTenantEnv.hash;
    }
  }

  const secretsToDelete = envVars.environment
    ? Object.keys(envVars.environment).filter((key) => !(key in secrets))
    : [];

  if (secretsToDelete.length) {
    await request.post(
      IntegrationUrls.HASURA_CLOUD_API_URL,
      {
        query: `
        mutation deleteTenantEnv($id: uuid!, $currentHash: String!, $env: [String!]!) {
          deleteTenantEnv(tenantId: $id, currentHash: $currentHash, deleteEnvs: $env) {
            hash
            envVars
          }
        }
        `,
        variables: {
          id: integration.appId,
          currentHash,
          env: secretsToDelete
        }
      },
      {
        headers: {
          Authorization: `pat ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );
  }
};

/** Sync/push [secrets] to Rundeck
 * @param {Object} obj
 * @param {TIntegrations} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for Rundeck integration
 */
const syncSecretsRundeck = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: TIntegrations;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  interface RundeckSecretResource {
    name: string;
  }
  interface RundeckSecretsGetRes {
    resources: RundeckSecretResource[];
  }

  let existingRundeckSecrets: string[] = [];

  try {
    const listResult = await request.get<RundeckSecretsGetRes>(
      `${integration.url}/api/44/storage/${integration.path}`,
      {
        headers: {
          "X-Rundeck-Auth-Token": accessToken
        }
      }
    );

    existingRundeckSecrets = listResult.data.resources.map((res) => res.name);
  } catch (err) {
    logger.info("No existing rundeck secrets");
  }

  try {
    for await (const [key, value] of Object.entries(secrets)) {
      if (existingRundeckSecrets.includes(key)) {
        await request.put(`${integration.url}/api/44/storage/${integration.path}/${key}`, value.value, {
          headers: {
            "X-Rundeck-Auth-Token": accessToken,
            "Content-Type": "application/x-rundeck-data-password"
          }
        });
      } else {
        await request.post(`${integration.url}/api/44/storage/${integration.path}/${key}`, value.value, {
          headers: {
            "X-Rundeck-Auth-Token": accessToken,
            "Content-Type": "application/x-rundeck-data-password"
          }
        });
      }
    }

    for await (const existingSecret of existingRundeckSecrets) {
      if (!(existingSecret in secrets)) {
        await request.delete(`${integration.url}/api/44/storage/${integration.path}/${existingSecret}`, {
          headers: {
            "X-Rundeck-Auth-Token": accessToken
          }
        });
      }
    }
  } catch (err: unknown) {
    throw new Error(
      `Ensure that the provided Rundeck URL is accessible by Infisical and that the linked API token has sufficient permissions.\n\n${
        (err as Error).message
      }`
    );
  }
};

/**
 * Sync/push [secrets] to [app] in integration named [integration]
 *
 * Do this in terms of DAL
 *
 */
export const syncIntegrationSecrets = async ({
  createManySecretsRawFn,
  updateManySecretsRawFn,
  integrationDAL,
  integration,
  integrationAuth,
  secrets,
  accessId,
  accessToken,
  awsAssumeRoleArn,
  appendices,
  projectId
}: {
  createManySecretsRawFn: (params: TCreateManySecretsRawFn) => Promise<Array<{ id: string }>>;
  updateManySecretsRawFn: (params: TUpdateManySecretsRawFn) => Promise<Array<{ id: string }>>;
  integrationDAL: Pick<TIntegrationDALFactory, "updateById">;
  integration: TIntegrations & {
    projectId: string;
    environment: {
      id: string;
      name: string;
      slug: string;
    };
    secretPath: string;
  };
  integrationAuth: TIntegrationAuths;
  secrets: Record<string, { value: string; comment?: string }>;
  accessId: string | null;
  awsAssumeRoleArn: string | null;
  accessToken: string;
  appendices?: { prefix: string; suffix: string };
  projectId?: string;
}) => {
  let response: { isSynced: boolean; syncMessage: string } | null = null;

  switch (integration.integration) {
    case Integrations.GCP_SECRET_MANAGER:
      await syncSecretsGCPSecretManager({
        integration,
        secrets,
        accessToken
      });
      break;
    case Integrations.AZURE_KEY_VAULT:
      await syncSecretsAzureKeyVault({
        integration,
        secrets,
        accessToken,
        createManySecretsRawFn,
        updateManySecretsRawFn
      });
      break;
    case Integrations.AWS_PARAMETER_STORE:
      response = await syncSecretsAWSParameterStore({
        integration,
        secrets,
        accessId,
        accessToken
      });
      break;
    case Integrations.AWS_SECRET_MANAGER:
      await syncSecretsAWSSecretManager({
        integration,
        secrets,
        accessId,
        accessToken,
        awsAssumeRoleArn,
        projectId
      });
      break;
    case Integrations.HEROKU:
      await syncSecretsHeroku({
        createManySecretsRawFn,
        updateManySecretsRawFn,
        integration,
        secrets,
        accessToken
      });
      break;
    case Integrations.VERCEL:
      await syncSecretsVercel({
        integration,
        integrationAuth,
        secrets,
        accessToken
      });
      break;
    case Integrations.NETLIFY:
      await syncSecretsNetlify({
        integration,
        integrationAuth,
        secrets,
        accessToken
      });
      break;
    case Integrations.GITHUB:
      await syncSecretsGitHub({
        integration,
        secrets,
        accessToken,
        appendices
      });
      break;
    case Integrations.GITLAB:
      await syncSecretsGitLab({
        integrationAuth,
        integration,
        secrets,
        accessToken
      });
      break;
    case Integrations.RENDER:
      await syncSecretsRender({
        integration,
        secrets,
        accessToken
      });
      break;
    case Integrations.RAILWAY:
      await syncSecretsRailway({
        integration,
        secrets,
        accessToken
      });
      break;
    case Integrations.FLYIO:
      await syncSecretsFlyio({
        integration,
        secrets,
        accessToken
      });
      break;
    case Integrations.CIRCLECI:
      await syncSecretsCircleCI({
        integration,
        secrets,
        accessToken
      });
      break;
    case Integrations.LARAVELFORGE:
      await syncSecretsLaravelForge({
        integration,
        secrets,
        accessId,
        accessToken
      });
      break;
    case Integrations.TRAVISCI:
      await syncSecretsTravisCI({
        integration,
        secrets,
        accessToken
      });
      break;
    case Integrations.SUPABASE:
      await syncSecretsSupabase({
        integration,
        secrets,
        accessToken
      });
      break;
    case Integrations.CHECKLY:
      await syncSecretsCheckly({
        integration,
        secrets,
        accessToken,
        appendices
      });
      break;
    case Integrations.QOVERY:
      await syncSecretsQovery({
        integration,
        secrets,
        accessToken
      });
      break;
    case Integrations.TERRAFORM_CLOUD:
      await syncSecretsTerraformCloud({
        createManySecretsRawFn,
        updateManySecretsRawFn,
        integration,
        secrets,
        accessToken,
        integrationDAL
      });
      break;
    case Integrations.HASHICORP_VAULT:
      await syncSecretsHashiCorpVault({
        integration,
        integrationAuth,
        secrets,
        accessId,
        accessToken
      });
      break;
    case Integrations.CLOUDFLARE_PAGES:
      await syncSecretsCloudflarePages({
        integration,
        secrets,
        accessId,
        accessToken
      });
      break;
    case Integrations.CLOUDFLARE_WORKERS:
      await syncSecretsCloudflareWorkers({
        integration,
        secrets,
        accessId,
        accessToken
      });
      break;
    case Integrations.CODEFRESH:
      await syncSecretsCodefresh({
        integration,
        secrets,
        accessToken
      });
      break;
    case Integrations.TEAMCITY:
      await syncSecretsTeamCity({
        integrationAuth,
        integration,
        secrets,
        accessToken
      });
      break;
    case Integrations.BITBUCKET:
      await syncSecretsBitBucket({
        integration,
        secrets,
        accessToken
      });
      break;
    case Integrations.DIGITAL_OCEAN_APP_PLATFORM:
      await syncSecretsDigitalOceanAppPlatform({
        integration,
        secrets,
        accessToken
      });
      break;
    case Integrations.CLOUD_66:
      await syncSecretsCloud66({
        integration,
        secrets,
        accessToken
      });
      break;
    case Integrations.NORTHFLANK:
      await syncSecretsNorthflank({
        integration,
        secrets,
        accessToken
      });
      break;
    case Integrations.WINDMILL:
      await syncSecretsWindmill({
        integration,
        secrets,
        accessToken
      });
      break;

    case Integrations.HASURA_CLOUD:
      await syncSecretsHasuraCloud({
        integration,
        secrets,
        accessToken
      });
      break;
    case Integrations.RUNDECK:
      await syncSecretsRundeck({
        integration,
        secrets,
        accessToken
      });
      break;
    default:
      throw new BadRequestError({ message: "Invalid integration" });
  }

  return response;
};
