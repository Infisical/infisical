import AWS, { AWSError } from "aws-sdk";

import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TAwsParameterStoreSyncWithCredentials } from "./aws-parameter-store-sync-types";

type TAWSParameterStoreRecord = Record<string, AWS.SSM.Parameter>;

const MAX_RETRIES = 5;
const BATCH_SIZE = 10;

const getSSM = async (secretSync: TAwsParameterStoreSyncWithCredentials) => {
  const { destinationConfig, connection } = secretSync;

  const config = await getAwsConnectionConfig(connection, destinationConfig.region);

  const ssm = new AWS.SSM({
    apiVersion: "2014-11-06",
    region: destinationConfig.region
  });

  ssm.config.update(config);

  return ssm;
};

const sleep = async () =>
  new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });

const getParametersByPath = async (ssm: AWS.SSM, path: string): Promise<TAWSParameterStoreRecord> => {
  const awsParameterStoreSecretsRecord: TAWSParameterStoreRecord = {};
  let hasNext = true;
  let nextToken: string | undefined;
  let attempt = 0;

  while (hasNext) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const parameters = await ssm
        .getParametersByPath({
          Path: path,
          Recursive: false,
          WithDecryption: true,
          MaxResults: BATCH_SIZE,
          NextToken: nextToken
        })
        .promise();

      attempt = 0;

      if (parameters.Parameters) {
        parameters.Parameters.forEach((parameter) => {
          if (parameter.Name) {
            // no leading slash if path is '/'
            const secKey = path.length > 1 ? parameter.Name.substring(path.length) : parameter.Name;
            awsParameterStoreSecretsRecord[secKey] = parameter;
          }
        });
      }

      hasNext = Boolean(parameters.NextToken);
      nextToken = parameters.NextToken;
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

  return awsParameterStoreSecretsRecord;
};

const putParameter = async (
  ssm: AWS.SSM,
  params: AWS.SSM.PutParameterRequest,
  attempt = 0
): Promise<AWS.SSM.PutParameterResult> => {
  try {
    return await ssm.putParameter(params).promise();
  } catch (error) {
    if ((error as AWSError).code === "ThrottlingException" && attempt < MAX_RETRIES) {
      await sleep();

      // retry
      return putParameter(ssm, params, attempt + 1);
    }
    throw error;
  }
};

const deleteParametersBatch = async (
  ssm: AWS.SSM,
  parameters: AWS.SSM.Parameter[],
  attempt = 0
): Promise<AWS.SSM.DeleteParameterResult[]> => {
  const results: AWS.SSM.DeleteParameterResult[] = [];
  let remainingParams = [...parameters];

  while (remainingParams.length > 0) {
    const batch = remainingParams.slice(0, BATCH_SIZE);

    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await ssm.deleteParameters({ Names: batch.map((param) => param.Name!) }).promise();
      results.push(result);
      remainingParams = remainingParams.slice(BATCH_SIZE);
    } catch (error) {
      if ((error as AWSError).code === "ThrottlingException" && attempt < MAX_RETRIES) {
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
    const { destinationConfig } = secretSync;

    const ssm = await getSSM(secretSync);

    // TODO(scott): KMS Key ID, Tags

    const awsParameterStoreSecretsRecord = await getParametersByPath(ssm, destinationConfig.path);

    for await (const entry of Object.entries(secretMap)) {
      const [key, { value }] = entry;

      // skip empty values (not allowed by AWS) or secrets that haven't changed
      if (!value || (key in awsParameterStoreSecretsRecord && awsParameterStoreSecretsRecord[key].Value === value)) {
        // eslint-disable-next-line no-continue
        continue;
      }

      try {
        await putParameter(ssm, {
          Name: `${destinationConfig.path}${key}`,
          Type: "SecureString",
          Value: value,
          Overwrite: true
        });
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }

    const parametersToDelete: AWS.SSM.Parameter[] = [];

    for (const entry of Object.entries(awsParameterStoreSecretsRecord)) {
      const [key, parameter] = entry;

      if (!(key in secretMap) || !secretMap[key].value) {
        parametersToDelete.push(parameter);
      }
    }

    await deleteParametersBatch(ssm, parametersToDelete);
  },
  getSecrets: async (secretSync: TAwsParameterStoreSyncWithCredentials): Promise<TSecretMap> => {
    const { destinationConfig } = secretSync;

    const ssm = await getSSM(secretSync);

    const awsParameterStoreSecretsRecord = await getParametersByPath(ssm, destinationConfig.path);

    return Object.fromEntries(
      Object.entries(awsParameterStoreSecretsRecord).map(([key, value]) => [key, { value: value.Value ?? "" }])
    );
  },
  removeSecrets: async (secretSync: TAwsParameterStoreSyncWithCredentials, secretMap: TSecretMap) => {
    const { destinationConfig } = secretSync;

    const ssm = await getSSM(secretSync);

    const awsParameterStoreSecretsRecord = await getParametersByPath(ssm, destinationConfig.path);

    const parametersToDelete: AWS.SSM.Parameter[] = [];

    for (const entry of Object.entries(awsParameterStoreSecretsRecord)) {
      const [key, param] = entry;

      if (key in secretMap) {
        parametersToDelete.push(param);
      }
    }

    await deleteParametersBatch(ssm, parametersToDelete);
  }
};
