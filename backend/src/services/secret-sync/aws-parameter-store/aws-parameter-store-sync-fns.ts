import {
  AccessDeniedException,
  AddTagsToResourceCommand,
  type AddTagsToResourceCommandInput,
  type AddTagsToResourceCommandOutput,
  DeleteParametersCommand,
  type DeleteParametersCommandOutput,
  DescribeParametersCommand,
  GetParametersByPathCommand,
  ListTagsForResourceCommand,
  type Parameter,
  type ParameterMetadata,
  PutParameterCommand,
  type PutParameterCommandInput,
  type PutParameterCommandOutput,
  RemoveTagsFromResourceCommand,
  type RemoveTagsFromResourceCommandInput,
  type RemoveTagsFromResourceCommandOutput,
  SSMClient,
  type Tag
} from "@aws-sdk/client-ssm";
import handlebars from "handlebars";

import { isAwsError } from "@app/lib/aws/error";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TAwsParameterStoreSyncWithCredentials } from "./aws-parameter-store-sync-types";

type TAWSParameterStoreRecord = Record<string, Parameter>;
type TAWSParameterStoreMetadataRecord = Record<string, ParameterMetadata>;
type TAWSParameterStoreTagsRecord = Record<string, Record<string, string>>;

const MAX_RETRIES = 10;
const BATCH_SIZE = 10;

const getSSM = async (secretSync: TAwsParameterStoreSyncWithCredentials) => {
  const { destinationConfig, connection } = secretSync;

  const config = await getAwsConnectionConfig(connection, destinationConfig.region);

  return new SSMClient({
    region: destinationConfig.region,
    credentials: config.credentials
  });
};

const sleep = async () =>
  new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });

const getFullPath = ({ path, keySchema, environment }: { path: string; keySchema?: string; environment: string }) => {
  if (!keySchema || !keySchema.includes("/")) return path;

  if (keySchema.startsWith("/")) {
    throw new SecretSyncError({ message: `Key schema cannot contain leading '/'`, shouldRetry: false });
  }

  const keySchemaSegments = handlebars
    .compile(keySchema)({
      environment,
      secretKey: "{{secretKey}}"
    })
    .split("/");

  const pathSegments = keySchemaSegments.slice(0, keySchemaSegments.length - 1);

  if (pathSegments.some((segment) => segment.includes("{{secretKey}}"))) {
    throw new SecretSyncError({
      message: "Key schema cannot contain '/' after {{secretKey}}",
      shouldRetry: false
    });
  }

  return `${path}${pathSegments.join("/")}/`;
};

const getParametersByPath = async (
  ssm: SSMClient,
  path: string,
  keySchema: string | undefined,
  environment: string
): Promise<TAWSParameterStoreRecord> => {
  const awsParameterStoreSecretsRecord: TAWSParameterStoreRecord = {};
  let hasNext = true;
  let nextToken: string | undefined;
  let attempt = 0;

  const fullPath = getFullPath({ path, keySchema, environment });

  while (hasNext) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const parameters = await ssm.send(
        new GetParametersByPathCommand({
          Path: fullPath,
          Recursive: false,
          WithDecryption: true,
          MaxResults: BATCH_SIZE,
          NextToken: nextToken
        })
      );

      attempt = 0;

      if (parameters.Parameters) {
        parameters.Parameters.forEach((parameter) => {
          if (parameter.Name) {
            // no leading slash if path is '/'
            const secKey = fullPath.length > 1 ? parameter.Name.substring(path.length) : parameter.Name;
            awsParameterStoreSecretsRecord[secKey] = parameter;
          }
        });
      }

      hasNext = Boolean(parameters.NextToken);
      nextToken = parameters.NextToken;
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

  return awsParameterStoreSecretsRecord;
};

const getParameterMetadataByPath = async (
  ssm: SSMClient,
  path: string,
  keySchema: string | undefined,
  environment: string
): Promise<TAWSParameterStoreMetadataRecord> => {
  const awsParameterStoreMetadataRecord: TAWSParameterStoreMetadataRecord = {};
  let hasNext = true;
  let nextToken: string | undefined;
  let attempt = 0;

  const fullPath = getFullPath({ path, keySchema, environment });

  while (hasNext) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const parameters = await ssm.send(
        new DescribeParametersCommand({
          MaxResults: 10,
          NextToken: nextToken,
          ParameterFilters: [
            {
              Key: "Path",
              Option: "OneLevel",
              Values: [fullPath]
            }
          ]
        })
      );

      attempt = 0;

      if (parameters.Parameters) {
        parameters.Parameters.forEach((parameter) => {
          if (parameter.Name) {
            // no leading slash if path is '/'
            const secKey = fullPath.length > 1 ? parameter.Name.substring(path.length) : parameter.Name;
            awsParameterStoreMetadataRecord[secKey] = parameter;
          }
        });
      }

      hasNext = Boolean(parameters.NextToken);
      nextToken = parameters.NextToken;
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

  return awsParameterStoreMetadataRecord;
};

const getParameterStoreTagsRecord = async (
  ssm: SSMClient,
  awsParameterStoreSecretsRecord: TAWSParameterStoreRecord,
  needsTagsPermissions: boolean
): Promise<{ shouldManageTags: boolean; awsParameterStoreTagsRecord: TAWSParameterStoreTagsRecord }> => {
  const awsParameterStoreTagsRecord: TAWSParameterStoreTagsRecord = {};

  for await (const entry of Object.entries(awsParameterStoreSecretsRecord)) {
    const [key, parameter] = entry;

    if (!parameter.Name) {
      // eslint-disable-next-line no-continue
      continue;
    }

    try {
      const tags = await ssm.send(
        new ListTagsForResourceCommand({
          ResourceType: "Parameter",
          ResourceId: parameter.Name
        })
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      awsParameterStoreTagsRecord[key] = Object.fromEntries(tags.TagList?.map((tag) => [tag.Key, tag.Value]) ?? []);
    } catch (e) {
      // users aren't required to provide tag permissions to use sync so we handle gracefully if unauthorized
      // and they aren't trying to configure tags
      if (e instanceof AccessDeniedException) {
        if (!needsTagsPermissions) {
          return { shouldManageTags: false, awsParameterStoreTagsRecord: {} };
        }

        throw new SecretSyncError({
          message:
            "IAM role has inadequate permissions to manage resource tags. Ensure the following policies are present: ssm:ListTagsForResource, ssm:AddTagsToResource, and ssm:RemoveTagsFromResource",
          shouldRetry: false
        });
      }

      throw e;
    }
  }

  return { shouldManageTags: true, awsParameterStoreTagsRecord };
};

const processParameterTags = ({
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

const putParameter = async (
  ssm: SSMClient,
  params: PutParameterCommandInput,
  attempt = 0
): Promise<PutParameterCommandOutput> => {
  try {
    return await ssm.send(new PutParameterCommand(params));
  } catch (error) {
    if (isAwsError(error, "ThrottlingException") && attempt < MAX_RETRIES) {
      await sleep();

      // retry
      return putParameter(ssm, params, attempt + 1);
    }
    throw error;
  }
};

const addTagsToParameter = async (
  ssm: SSMClient,
  params: Omit<AddTagsToResourceCommandInput, "ResourceType">,
  attempt = 0
): Promise<AddTagsToResourceCommandOutput> => {
  try {
    return await ssm.send(new AddTagsToResourceCommand({ ...params, ResourceType: "Parameter" }));
  } catch (error) {
    if (isAwsError(error, "ThrottlingException") && attempt < MAX_RETRIES) {
      await sleep();

      // retry
      return addTagsToParameter(ssm, params, attempt + 1);
    }
    throw error;
  }
};

const removeTagsFromParameter = async (
  ssm: SSMClient,
  params: Omit<RemoveTagsFromResourceCommandInput, "ResourceType">,
  attempt = 0
): Promise<RemoveTagsFromResourceCommandOutput> => {
  try {
    return await ssm.send(new RemoveTagsFromResourceCommand({ ...params, ResourceType: "Parameter" }));
  } catch (error) {
    if (isAwsError(error, "ThrottlingException") && attempt < MAX_RETRIES) {
      await sleep();

      // retry
      return removeTagsFromParameter(ssm, params, attempt + 1);
    }
    throw error;
  }
};

const deleteParametersBatch = async (
  ssm: SSMClient,
  parameters: Parameter[],
  attempt = 0
): Promise<DeleteParametersCommandOutput[]> => {
  const results: DeleteParametersCommandOutput[] = [];
  let remainingParams = [...parameters];

  while (remainingParams.length > 0) {
    const batch = remainingParams.slice(0, BATCH_SIZE);

    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await ssm.send(new DeleteParametersCommand({ Names: batch.map((param) => param.Name!) }));
      results.push(result);
      remainingParams = remainingParams.slice(BATCH_SIZE);
    } catch (error) {
      if (isAwsError(error, "ThrottlingException") && attempt < MAX_RETRIES) {
        // eslint-disable-next-line no-await-in-loop
        await sleep();

        // Retry the current batch
        // eslint-disable-next-line no-await-in-loop
        return [...results, ...(await deleteParametersBatch(ssm, remainingParams, attempt + 1))];
      }
      throw error;
    }
  }

  return results;
};

export const AwsParameterStoreSyncFns = {
  syncSecrets: async (secretSync: TAwsParameterStoreSyncWithCredentials, secretMap: TSecretMap) => {
    const { destinationConfig, syncOptions, environment } = secretSync;

    const ssm = await getSSM(secretSync);

    const awsParameterStoreSecretsRecord = await getParametersByPath(
      ssm,
      destinationConfig.path,
      syncOptions.keySchema,
      environment!.slug
    );

    const awsParameterStoreMetadataRecord = await getParameterMetadataByPath(
      ssm,
      destinationConfig.path,
      syncOptions.keySchema,
      environment!.slug
    );

    const { shouldManageTags, awsParameterStoreTagsRecord } = await getParameterStoreTagsRecord(
      ssm,
      awsParameterStoreSecretsRecord,
      Boolean(syncOptions.tags?.length || syncOptions.syncSecretMetadataAsTags)
    );

    const createdSecretKeys: string[] = [];
    const updatedSecretKeys: string[] = [];
    const deletedSecretKeys: string[] = [];

    for await (const entry of Object.entries(secretMap)) {
      const [key, { value, secretMetadata }] = entry;

      // skip empty values (not allowed by AWS)
      if (!value) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const keyId = syncOptions.keyId ?? "alias/aws/ssm";

      const isNew = !(key in awsParameterStoreSecretsRecord);
      const isChanged =
        !isNew &&
        (value !== awsParameterStoreSecretsRecord[key].Value || keyId !== awsParameterStoreMetadataRecord[key]?.KeyId);

      if (isNew || isChanged) {
        try {
          await putParameter(ssm, {
            Name: `${destinationConfig.path}${key}`,
            Type: "SecureString",
            Value: value,
            Overwrite: true,
            KeyId: keyId
          });
          if (isNew) createdSecretKeys.push(key);
          else updatedSecretKeys.push(key);
        } catch (error) {
          throw new SecretSyncError({
            error,
            secretKey: key
          });
        }
      }

      if ((syncOptions.tags !== undefined || syncOptions.syncSecretMetadataAsTags) && shouldManageTags) {
        const { tagsToAdd, tagKeysToRemove } = processParameterTags({
          syncTagsRecord: {
            // configured sync tags take preference over secret metadata
            ...(syncOptions.syncSecretMetadataAsTags &&
              Object.fromEntries(secretMetadata?.map((tag) => [tag.key, tag.value]) ?? [])),
            ...(syncOptions.tags && Object.fromEntries(syncOptions.tags?.map((tag) => [tag.key, tag.value]) ?? []))
          },
          awsTagsRecord: awsParameterStoreTagsRecord[key] ?? {}
        });

        if (tagsToAdd.length) {
          try {
            await addTagsToParameter(ssm, {
              ResourceId: `${destinationConfig.path}${key}`,
              Tags: tagsToAdd
            });
          } catch (error) {
            throw new SecretSyncError({
              error,
              secretKey: key
            });
          }
        }

        if (tagKeysToRemove.length) {
          try {
            await removeTagsFromParameter(ssm, {
              ResourceId: `${destinationConfig.path}${key}`,
              TagKeys: tagKeysToRemove
            });
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

    const parametersToDelete: Parameter[] = [];

    for (const entry of Object.entries(awsParameterStoreSecretsRecord)) {
      const [key, parameter] = entry;

      // eslint-disable-next-line no-continue
      if (!matchesSchema(key, environment?.slug || "", syncOptions.keySchema)) continue;

      if (!(key in secretMap) || !secretMap[key].value) {
        parametersToDelete.push(parameter);
        deletedSecretKeys.push(parameter.Name!);
      }
    }

    await deleteParametersBatch(ssm, parametersToDelete);

    return { createdSecretKeys, updatedSecretKeys, deletedSecretKeys };
  },
  getSecrets: async (secretSync: TAwsParameterStoreSyncWithCredentials): Promise<TSecretMap> => {
    const { destinationConfig, syncOptions, environment } = secretSync;

    const ssm = await getSSM(secretSync);

    const awsParameterStoreSecretsRecord = await getParametersByPath(
      ssm,
      destinationConfig.path,
      syncOptions.keySchema,
      environment!.slug
    );

    return Object.fromEntries(
      Object.entries(awsParameterStoreSecretsRecord).map(([key, value]) => [key, { value: value.Value ?? "" }])
    );
  },
  removeSecrets: async (secretSync: TAwsParameterStoreSyncWithCredentials, secretMap: TSecretMap) => {
    const { destinationConfig, syncOptions, environment } = secretSync;

    const ssm = await getSSM(secretSync);

    const awsParameterStoreSecretsRecord = await getParametersByPath(
      ssm,
      destinationConfig.path,
      syncOptions.keySchema,
      environment!.slug
    );

    const parametersToDelete: Parameter[] = [];

    for (const entry of Object.entries(awsParameterStoreSecretsRecord)) {
      const [key, param] = entry;

      if (key in secretMap) {
        parametersToDelete.push(param);
      }
    }

    await deleteParametersBatch(ssm, parametersToDelete);
  }
};
