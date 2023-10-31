import {
  CreateSecretCommand,
  GetSecretValueCommand,
  ResourceNotFoundException,
  SecretsManagerClient,
  UpdateSecretCommand
} from "@aws-sdk/client-secrets-manager";
import { IIntegration, IIntegrationAuth } from "../models";
import {
  INTEGRATION_AWS_PARAMETER_STORE,
  INTEGRATION_AWS_SECRET_MANAGER,
  INTEGRATION_AZURE_KEY_VAULT,
  INTEGRATION_BITBUCKET,
  INTEGRATION_BITBUCKET_API_URL,
  INTEGRATION_CHECKLY,
  INTEGRATION_CHECKLY_API_URL,
  INTEGRATION_CIRCLECI,
  INTEGRATION_CIRCLECI_API_URL,
  INTEGRATION_CLOUDFLARE_PAGES,
  INTEGRATION_CLOUDFLARE_PAGES_API_URL,
  INTEGRATION_CLOUD_66,
  INTEGRATION_CLOUD_66_API_URL,
  INTEGRATION_CODEFRESH,
  INTEGRATION_CODEFRESH_API_URL,
  INTEGRATION_DIGITAL_OCEAN_API_URL,
  INTEGRATION_DIGITAL_OCEAN_APP_PLATFORM,
  INTEGRATION_FLYIO,
  INTEGRATION_FLYIO_API_URL,
  INTEGRATION_GCP_SECRET_MANAGER,
  INTEGRATION_GCP_SECRET_MANAGER_URL,
  INTEGRATION_GITHUB,
  INTEGRATION_GITLAB,
  INTEGRATION_GITLAB_API_URL,
  INTEGRATION_HASHICORP_VAULT,
  INTEGRATION_HASURA_CLOUD,
  INTEGRATION_HASURA_CLOUD_API_URL,
  INTEGRATION_HEROKU,
  INTEGRATION_HEROKU_API_URL,
  INTEGRATION_LARAVELFORGE,
  INTEGRATION_LARAVELFORGE_API_URL,
  INTEGRATION_NETLIFY,
  INTEGRATION_NETLIFY_API_URL,
  INTEGRATION_NORTHFLANK,
  INTEGRATION_NORTHFLANK_API_URL,
  INTEGRATION_QOVERY,
  INTEGRATION_QOVERY_API_URL,
  INTEGRATION_RAILWAY,
  INTEGRATION_RAILWAY_API_URL,
  INTEGRATION_RENDER,
  INTEGRATION_RENDER_API_URL,
  INTEGRATION_SUPABASE,
  INTEGRATION_SUPABASE_API_URL,
  INTEGRATION_TEAMCITY,
  INTEGRATION_TERRAFORM_CLOUD,
  INTEGRATION_TERRAFORM_CLOUD_API_URL,
  INTEGRATION_TRAVISCI,
  INTEGRATION_TRAVISCI_API_URL,
  INTEGRATION_VERCEL,
  INTEGRATION_VERCEL_API_URL,
  INTEGRATION_WINDMILL,
  INTEGRATION_WINDMILL_API_URL
} from "../variables";
import AWS from "aws-sdk";
import { Octokit } from "@octokit/rest";
import _ from "lodash";
import sodium from "libsodium-wrappers";
import { standardRequest } from "../config/request";
import {
  ZGetTenantEnv,
  ZUpdateTenantEnv
} from "../validation/hasuraCloudIntegration";

const getSecretKeyValuePair = (
  secrets: Record<string, { value: string | null; comment?: string } | null>
) =>
  Object.keys(secrets).reduce<Record<string, string | null | undefined>>((prev, key) => {
    prev[key] = secrets?.[key] === null ? null : secrets?.[key]?.value;
    return prev;
  }, {});

/**
 * Sync/push [secrets] to [app] in integration named [integration]
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {IIntegrationAuth} obj.integrationAuth - integration auth details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessId - access id for integration
 * @param {String} obj.accessToken - access token for integration
 * @param {Object} obj.secretComments - secret comments to push to integration (object where keys are secret keys and values are comment values)
 */
const syncSecrets = async ({
  integration,
  integrationAuth,
  secrets,
  accessId,
  accessToken,
  appendices
}: {
  integration: IIntegration;
  integrationAuth: IIntegrationAuth;
  secrets: Record<string, { value: string; comment?: string }>;
  accessId: string | null;
  accessToken: string;
  appendices?: { prefix: string; suffix: string };
}) => {
  switch (integration.integration) {
    case INTEGRATION_GCP_SECRET_MANAGER:
      await syncSecretsGCPSecretManager({
        integration,
        secrets,
        accessToken
      });
      break;
    case INTEGRATION_AZURE_KEY_VAULT:
      await syncSecretsAzureKeyVault({
        integration,
        secrets,
        accessToken
      });
      break;
    case INTEGRATION_AWS_PARAMETER_STORE:
      await syncSecretsAWSParameterStore({
        integration,
        secrets,
        accessId,
        accessToken
      });
      break;
    case INTEGRATION_AWS_SECRET_MANAGER:
      await syncSecretsAWSSecretManager({
        integration,
        secrets,
        accessId,
        accessToken
      });
      break;
    case INTEGRATION_HEROKU:
      await syncSecretsHeroku({
        integration,
        secrets,
        accessToken
      });
      break;
    case INTEGRATION_VERCEL:
      await syncSecretsVercel({
        integration,
        integrationAuth,
        secrets,
        accessToken
      });
      break;
    case INTEGRATION_NETLIFY:
      await syncSecretsNetlify({
        integration,
        integrationAuth,
        secrets,
        accessToken
      });
      break;
    case INTEGRATION_GITHUB:
      await syncSecretsGitHub({
        integration,
        secrets,
        accessToken,
        appendices
      });
      break;
    case INTEGRATION_GITLAB:
      await syncSecretsGitLab({
        integrationAuth,
        integration,
        secrets,
        accessToken
      });
      break;
    case INTEGRATION_RENDER:
      await syncSecretsRender({
        integration,
        secrets,
        accessToken
      });
      break;
    case INTEGRATION_RAILWAY:
      await syncSecretsRailway({
        integration,
        secrets,
        accessToken
      });
      break;
    case INTEGRATION_FLYIO:
      await syncSecretsFlyio({
        integration,
        secrets,
        accessToken
      });
      break;
    case INTEGRATION_CIRCLECI:
      await syncSecretsCircleCI({
        integration,
        secrets,
        accessToken
      });
      break;
    case INTEGRATION_LARAVELFORGE:
      await syncSecretsLaravelForge({
        integration,
        secrets,
        accessId,
        accessToken
      });
      break;
    case INTEGRATION_TRAVISCI:
      await syncSecretsTravisCI({
        integration,
        secrets,
        accessToken
      });
      break;
    case INTEGRATION_SUPABASE:
      await syncSecretsSupabase({
        integration,
        secrets,
        accessToken
      });
      break;
    case INTEGRATION_CHECKLY:
      await syncSecretsCheckly({
        integration,
        secrets,
        accessToken,
        appendices
      });
      break;
    case INTEGRATION_QOVERY:
      await syncSecretsQovery({
        integration,
        secrets,
        accessToken
      });
      break;
    case INTEGRATION_TERRAFORM_CLOUD:
      await syncSecretsTerraformCloud({
        integration,
        secrets,
        accessToken
      });
      break;
    case INTEGRATION_HASHICORP_VAULT:
      await syncSecretsHashiCorpVault({
        integration,
        integrationAuth,
        secrets,
        accessId,
        accessToken
      });
      break;
    case INTEGRATION_CLOUDFLARE_PAGES:
      await syncSecretsCloudflarePages({
        integration,
        secrets,
        accessId,
        accessToken
      });
      break;
    case INTEGRATION_CODEFRESH:
      await syncSecretsCodefresh({
        integration,
        secrets,
        accessToken
      });
      break;
    case INTEGRATION_TEAMCITY:
      await syncSecretsTeamCity({
        integrationAuth,
        integration,
        secrets,
        accessToken
      });
      break;
    case INTEGRATION_BITBUCKET:
      await syncSecretsBitBucket({
        integration,
        secrets,
        accessToken
      });
      break;
    case INTEGRATION_DIGITAL_OCEAN_APP_PLATFORM:
      await syncSecretsDigitalOceanAppPlatform({
        integration,
        secrets,
        accessToken
      });
      break;
    case INTEGRATION_CLOUD_66:
      await syncSecretsCloud66({
        integration,
        secrets,
        accessToken
      });
      break;
    case INTEGRATION_NORTHFLANK:
      await syncSecretsNorthflank({
        integration,
        secrets,
        accessToken
      });
      break;
    case INTEGRATION_WINDMILL:
      await syncSecretsWindmill({
        integration,
        secrets,
        accessToken
      });
      break;

    case INTEGRATION_HASURA_CLOUD:
      await syncSecretsHasuraCloud({
        integration,
        secrets,
        accessToken
      });
      break;
  }
};

/**
 * Sync/push [secrets] to GCP secret manager project
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for GCP secret manager
 */
const syncSecretsGCPSecretManager = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: IIntegration;
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

  const filterParam = integration.metadata.secretGCPLabel
    ? `?filter=labels.${integration.metadata.secretGCPLabel.labelName}=${integration.metadata.secretGCPLabel.labelValue}`
    : "";

  while (hasMorePages) {
    const params = new URLSearchParams({
      pageSize: String(pageSize),
      ...(pageToken ? { pageToken } : {})
    });

    const res: GCPSMListSecretsRes = (
      await standardRequest.get(
        `${INTEGRATION_GCP_SECRET_MANAGER_URL}/v1/projects/${integration.appId}/secrets${filterParam}`,
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

        if (
          integration.metadata.secretPrefix &&
          !key.startsWith(integration.metadata.secretPrefix)
        ) {
          isValid = false;
        }

        if (integration.metadata.secretSuffix && !key.endsWith(integration.metadata.secretSuffix)) {
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
      await standardRequest.get(
        `${INTEGRATION_GCP_SECRET_MANAGER_URL}/v1/projects/${integration.appId}/secrets/${key}/versions/latest:access`,
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
      await standardRequest.post(
        `${INTEGRATION_GCP_SECRET_MANAGER_URL}/v1/projects/${integration.appId}/secrets`,
        {
          replication: {
            automatic: {}
          },
          ...(integration.metadata.secretGCPLabel
            ? {
                labels: {
                  [integration.metadata.secretGCPLabel.labelName]:
                    integration.metadata.secretGCPLabel.labelValue
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

      await standardRequest.post(
        `${INTEGRATION_GCP_SECRET_MANAGER_URL}/v1/projects/${integration.appId}/secrets/${key}:addVersion`,
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
      await standardRequest.delete(
        `${INTEGRATION_GCP_SECRET_MANAGER_URL}/v1/projects/${integration.appId}/secrets/${key}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        }
      );
    } else {
      // case: update secret
      if (secrets[key].value !== res[key]) {
        await standardRequest.post(
          `${INTEGRATION_GCP_SECRET_MANAGER_URL}/v1/projects/${integration.appId}/secrets/${key}:addVersion`,
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
  }
};

/**
 * Sync/push [secrets] to Azure Key Vault with vault URI [integration.app]
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for Azure Key Vault integration
 */
const syncSecretsAzureKeyVault = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: IIntegration;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  interface GetAzureKeyVaultSecret {
    id: string; // secret URI
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
      const res = await standardRequest.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      result = result.concat(res.data.value);

      url = res.data.nextLink;
    }

    return result;
  };

  const getAzureKeyVaultSecrets = await paginateAzureKeyVaultSecrets(
    `${integration.app}/secrets?api-version=7.3`
  );

  let lastSlashIndex: number;
  const res = (
    await Promise.all(
      getAzureKeyVaultSecrets.map(async (getAzureKeyVaultSecret) => {
        if (!lastSlashIndex) {
          lastSlashIndex = getAzureKeyVaultSecret.id.lastIndexOf("/");
        }

        const azureKeyVaultSecret = await standardRequest.get(
          `${getAzureKeyVaultSecret.id}?api-version=7.3`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        );

        return {
          ...azureKeyVaultSecret.data,
          key: getAzureKeyVaultSecret.id.substring(lastSlashIndex + 1)
        };
      })
    )
  ).reduce(
    (obj: any, secret: any) => ({
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
    } else {
      if (secrets[key] !== res[hyphenatedKey].value) {
        // case: secret has been updated
        setSecrets.push({
          key: hyphenatedKey,
          value: secrets[key].value
        });
      }
    }
  });

  const deleteSecrets: AzureKeyVaultSecret[] = [];

  Object.keys(res).forEach((key) => {
    const underscoredKey = key.replace(/-/g, "_");
    if (!(underscoredKey in secrets)) {
      deleteSecrets.push(res[key]);
    }
  });

  const setSecretAzureKeyVault = async ({
    key,
    value,
    integration,
    accessToken
  }: {
    key: string;
    value: string;
    integration: IIntegration;
    accessToken: string;
  }) => {
    let isSecretSet = false;
    let maxTries = 6;

    while (!isSecretSet && maxTries > 0) {
      // try to set secret
      try {
        await standardRequest.put(
          `${integration.app}/secrets/${key}?api-version=7.3`,
          {
            value
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        );

        isSecretSet = true;
      } catch (err) {
        const error: any = err;
        if (error?.response?.data?.error?.innererror?.code === "ObjectIsDeletedButRecoverable") {
          await standardRequest.post(
            `${integration.app}/deletedsecrets/${key}/recover?api-version=7.3`,
            {},
            {
              headers: {
                Authorization: `Bearer ${accessToken}`
              }
            }
          );
          await new Promise((resolve) => setTimeout(resolve, 10000));
        } else {
          await new Promise((resolve) => setTimeout(resolve, 10000));
          maxTries--;
        }
      }
    }
  };

  // Sync/push set secrets
  for await (const setSecret of setSecrets) {
    const { key, value } = setSecret;
    setSecretAzureKeyVault({
      key,
      value,
      integration,
      accessToken
    });
  }

  for await (const deleteSecret of deleteSecrets) {
    const { key } = deleteSecret;
    await standardRequest.delete(`${integration.app}/secrets/${key}?api-version=7.3`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }
};

/**
 * Sync/push [secrets] to AWS parameter store
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessId - access id for AWS parameter store integration
 * @param {String} obj.accessToken - access token for AWS parameter store integration
 */
const syncSecretsAWSParameterStore = async ({
  integration,
  secrets,
  accessId,
  accessToken
}: {
  integration: IIntegration;
  secrets: Record<string, { value: string; comment?: string }>;
  accessId: string | null;
  accessToken: string;
}) => {
  if (!accessId) return;

  AWS.config.update({
    region: integration.region,
    accessKeyId: accessId,
    secretAccessKey: accessToken
  });

  const ssm = new AWS.SSM({
    apiVersion: "2014-11-06",
    region: integration.region
  });

  const params = {
    Path: integration.path,
    Recursive: true,
    WithDecryption: true
  };

  const parameterList = (await ssm.getParametersByPath(params).promise()).Parameters;

  let awsParameterStoreSecretsObj: {
    [key: string]: any;
  } = {};

  if (parameterList) {
    awsParameterStoreSecretsObj = parameterList.reduce((obj: any, secret: any) => {
      return {
        ...obj,
        [secret.Name.substring(integration.path.length)]: secret
      };
    }, {});
  }

  // Identify secrets to create
  Object.keys(secrets).map(async (key) => {
    if (!(key in awsParameterStoreSecretsObj)) {
      // case: secret does not exist in AWS parameter store
      // -> create secret
      await ssm
        .putParameter({
          Name: `${integration.path}${key}`,
          Type: "SecureString",
          Value: secrets[key].value,
          Overwrite: true
        })
        .promise();
    } else {
      // case: secret exists in AWS parameter store

      if (awsParameterStoreSecretsObj[key].Value !== secrets[key].value) {
        // case: secret value doesn't match one in AWS parameter store
        // -> update secret
        await ssm
          .putParameter({
            Name: `${integration.path}${key}`,
            Type: "SecureString",
            Value: secrets[key].value,
            Overwrite: true
          })
          .promise();
      }
    }
  });

  // Identify secrets to delete
  Object.keys(awsParameterStoreSecretsObj).map(async (key) => {
    if (!(key in secrets)) {
      // case:
      // -> delete secret
      await ssm
        .deleteParameter({
          Name: awsParameterStoreSecretsObj[key].Name
        })
        .promise();
    }
  });

  AWS.config.update({
    region: undefined,
    accessKeyId: undefined,
    secretAccessKey: undefined
  });
};

/**
 * Sync/push [secrets] to AWS Secrets Manager
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessId - access id for AWS Secrets Manager integration
 * @param {String} obj.accessToken - access token for AWS Secrets Manager integration
 */
const syncSecretsAWSSecretManager = async ({
  integration,
  secrets,
  accessId,
  accessToken
}: {
  integration: IIntegration;
  secrets: Record<string, { value: string; comment?: string }>;
  accessId: string | null;
  accessToken: string;
}) => {
  let secretsManager;
  const secKeyVal = getSecretKeyValuePair(secrets);
  try {
    if (!accessId) return;

    AWS.config.update({
      region: integration.region,
      accessKeyId: accessId,
      secretAccessKey: accessToken
    });

    secretsManager = new SecretsManagerClient({
      region: integration.region,
      credentials: {
        accessKeyId: accessId,
        secretAccessKey: accessToken
      }
    });

    const awsSecretManagerSecret = await secretsManager.send(
      new GetSecretValueCommand({
        SecretId: integration.app
      })
    );

    let awsSecretManagerSecretObj: { [key: string]: any } = {};

    if (awsSecretManagerSecret?.SecretString) {
      awsSecretManagerSecretObj = JSON.parse(awsSecretManagerSecret.SecretString);
    }

    if (!_.isEqual(awsSecretManagerSecretObj, secKeyVal)) {
      await secretsManager.send(
        new UpdateSecretCommand({
          SecretId: integration.app,
          SecretString: JSON.stringify(secKeyVal)
        })
      );
    }

    AWS.config.update({
      region: undefined,
      accessKeyId: undefined,
      secretAccessKey: undefined
    });
  } catch (err) {
    if (err instanceof ResourceNotFoundException && secretsManager) {
      await secretsManager.send(
        new CreateSecretCommand({
          Name: integration.app,
          SecretString: JSON.stringify(secKeyVal)
        })
      );
    }
    AWS.config.update({
      region: undefined,
      accessKeyId: undefined,
      secretAccessKey: undefined
    });
  }
};

/**
 * Sync/push [secrets] to Heroku app named [integration.app]
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for Heroku integration
 */
const syncSecretsHeroku = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: IIntegration;
  secrets: Record<string, { value: string; comment?: string } | null>;
  accessToken: string;
}) => {
  const herokuSecrets = (
    await standardRequest.get(`${INTEGRATION_HEROKU_API_URL}/apps/${integration.app}/config-vars`, {
      headers: {
        Accept: "application/vnd.heroku+json; version=3",
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    })
  ).data;

  Object.keys(herokuSecrets).forEach((key) => {
    if (!(key in secrets)) {
      secrets[key] = null;
    }
  });

  await standardRequest.patch(
    `${INTEGRATION_HEROKU_API_URL}/apps/${integration.app}/config-vars`,
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
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 */
const syncSecretsVercel = async ({
  integration,
  integrationAuth,
  secrets,
  accessToken
}: {
  integration: IIntegration;
  integrationAuth: IIntegrationAuth;
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

  const vercelSecrets: VercelSecret[] = (
    await standardRequest.get(`${INTEGRATION_VERCEL_API_URL}/v9/projects/${integration.app}/env`, {
      params,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    })
  ).data.envs.filter((secret: VercelSecret) => {
    if (!secret.target.includes(integration.targetEnvironment)) {
      // case: secret does not have the same target environment
      return false;
    }

    if (
      integration.targetEnvironment === "preview" &&
      secret.gitBranch &&
      integration.path !== secret.gitBranch
    ) {
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
        await standardRequest.get(
          `${INTEGRATION_VERCEL_API_URL}/v9/projects/${integration.app}/env/${vercelSecret.id}`,
          {
            params,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Accept-Encoding": "application/json"
            }
          }
        )
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
  Object.keys(secrets).map((key) => {
    if (!(key in res)) {
      // case: secret has been created
      newSecrets.push({
        key: key,
        value: secrets[key].value,
        type: "encrypted",
        target: [integration.targetEnvironment],
        ...(integration.path
          ? {
              gitBranch: integration.path
            }
          : {})
      });
    }
  });

  // Identify secrets to update and delete
  Object.keys(res).map((key) => {
    if (key in secrets) {
      if (res[key].value !== secrets[key].value) {
        // case: secret value has changed
        updateSecrets.push({
          id: res[key].id,
          key: key,
          value: secrets[key].value,
          type: res[key].type,
          target: res[key].target.includes(integration.targetEnvironment)
            ? [...res[key].target]
            : [...res[key].target, integration.targetEnvironment],
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
        key: key,
        value: res[key].value,
        type: "encrypted", // value doesn't matter
        target: [integration.targetEnvironment],
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
    await standardRequest.post(
      `${INTEGRATION_VERCEL_API_URL}/v10/projects/${integration.app}/env`,
      newSecrets,
      {
        params,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );
  }

  for await (const secret of updateSecrets) {
    if (secret.type !== "sensitive") {
      const { id, ...updatedSecret } = secret;
      await standardRequest.patch(
        `${INTEGRATION_VERCEL_API_URL}/v9/projects/${integration.app}/env/${id}`,
        updatedSecret,
        {
          params,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        }
      );
    }
  }

  for await (const secret of deleteSecrets) {
    await standardRequest.delete(
      `${INTEGRATION_VERCEL_API_URL}/v9/projects/${integration.app}/env/${secret.id}`,
      {
        params,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );
  }
};

/**
 * Sync/push [secrets] to Netlify site with id [integration.appId]
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {IIntegrationAuth} obj.integrationAuth - integration auth details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {Object} obj.accessToken - access token for Netlify integration
 */
const syncSecretsNetlify = async ({
  integration,
  integrationAuth,
  secrets,
  accessToken
}: {
  integration: IIntegration;
  integrationAuth: IIntegrationAuth;
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
    site_id: integration.appId
  });

  const res = (
    await standardRequest.get(
      `${INTEGRATION_NETLIFY_API_URL}/api/v1/accounts/${integrationAuth.accountId}/env`,
      {
        params: getParams,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    )
  ).data.reduce(
    (obj: any, secret: any) => ({
      ...obj,
      [secret.key]: secret
    }),
    {}
  );

  const newSecrets: NetlifySecret[] = []; // createEnvVars
  const deleteSecrets: string[] = []; // deleteEnvVar
  const deleteSecretValues: NetlifySecret[] = []; // deleteEnvVarValue
  const updateSecrets: NetlifySecret[] = []; // setEnvVarValue

  // identify secrets to create and update
  Object.keys(secrets).map((key) => {
    if (!(key in res)) {
      // case: Infisical secret does not exist in Netlify -> create secret
      newSecrets.push({
        key,
        values: [
          {
            value: secrets[key].value,
            context: integration.targetEnvironment
          }
        ]
      });
    } else {
      // case: Infisical secret exists in Netlify
      const contexts = res[key].values.reduce(
        (obj: any, value: NetlifyValue) => ({
          ...obj,
          [value.context]: value
        }),
        {}
      );

      if (integration.targetEnvironment in contexts) {
        // case: Netlify secret value exists in integration context
        if (secrets[key] !== contexts[integration.targetEnvironment].value) {
          // case: Infisical and Netlify secret values are different
          // -> update Netlify secret context and value
          updateSecrets.push({
            key,
            values: [
              {
                context: integration.targetEnvironment,
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
              context: integration.targetEnvironment,
              value: secrets[key].value
            }
          ]
        });
      }
    }
  });

  // identify secrets to delete
  // TODO: revise (patch case where 1 context was deleted but others still there
  Object.keys(res).map((key) => {
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
    site_id: integration.appId
  });

  if (newSecrets.length > 0) {
    await standardRequest.post(
      `${INTEGRATION_NETLIFY_API_URL}/api/v1/accounts/${integrationAuth.accountId}/env`,
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
    updateSecrets.forEach(async (secret: NetlifySecret) => {
      await standardRequest.patch(
        `${INTEGRATION_NETLIFY_API_URL}/api/v1/accounts/${integrationAuth.accountId}/env/${secret.key}`,
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
    });
  }

  if (deleteSecrets.length > 0) {
    deleteSecrets.forEach(async (key: string) => {
      await standardRequest.delete(
        `${INTEGRATION_NETLIFY_API_URL}/api/v1/accounts/${integrationAuth.accountId}/env/${key}`,
        {
          params: syncParams,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        }
      );
    });
  }

  if (deleteSecretValues.length > 0) {
    deleteSecretValues.forEach(async (secret: NetlifySecret) => {
      await standardRequest.delete(
        `${INTEGRATION_NETLIFY_API_URL}/api/v1/accounts/${integrationAuth.accountId}/env/${secret.key}/value/${secret.values[0].id}`,
        {
          params: syncParams,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        }
      );
    });
  }
};

/**
 * Sync/push [secrets] to GitHub repo with name [integration.app]
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {IIntegrationAuth} obj.integrationAuth - integration auth details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for GitHub integration
 */
const syncSecretsGitHub = async ({
  integration,
  secrets,
  accessToken,
  appendices
}: {
  integration: IIntegration;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
  appendices?: { prefix: string; suffix: string };
}) => {
  interface GitHubRepoKey {
    key_id: string;
    key: string;
  }

  interface GitHubSecret {
    name: string;
    created_at: string;
    updated_at: string;
  }

  interface GitHubSecretRes {
    [index: string]: GitHubSecret;
  }

  const octokit = new Octokit({
    auth: accessToken
  });

  // const user = (await octokit.request('GET /user', {})).data;
  const repoPublicKey: GitHubRepoKey = (
    await octokit.request("GET /repos/{owner}/{repo}/actions/secrets/public-key", {
      owner: integration.owner,
      repo: integration.app
    })
  ).data;

  // Get local copy of decrypted secrets. We cannot decrypt them as we dont have access to GH private key
  let encryptedSecrets: GitHubSecretRes = (
    await octokit.request("GET /repos/{owner}/{repo}/actions/secrets", {
      owner: integration.owner,
      repo: integration.app
    })
  ).data.secrets.reduce(
    (obj: any, secret: any) => ({
      ...obj,
      [secret.name]: secret
    }),
    {}
  );

  encryptedSecrets = Object.keys(encryptedSecrets).reduce(
    (
      result: {
        [key: string]: GitHubSecret;
      },
      key
    ) => {
      if (
        (appendices?.prefix !== undefined ? key.startsWith(appendices?.prefix) : true) &&
        (appendices?.suffix !== undefined ? key.endsWith(appendices?.suffix) : true)
      ) {
        result[key] = encryptedSecrets[key];
      }
      return result;
    },
    {}
  );

  Object.keys(encryptedSecrets).map(async (key) => {
    if (!(key in secrets)) {
      await octokit.request("DELETE /repos/{owner}/{repo}/actions/secrets/{secret_name}", {
        owner: integration.owner,
        repo: integration.app,
        secret_name: key
      });
    }
  });

  Object.keys(secrets).map((key) => {
    // let encryptedSecret;
    sodium.ready.then(async () => {
      // convert secret & base64 key to Uint8Array.
      const binkey = sodium.from_base64(repoPublicKey.key, sodium.base64_variants.ORIGINAL);
      const binsec = sodium.from_string(secrets[key].value);

      // encrypt secret using libsodium
      const encBytes = sodium.crypto_box_seal(binsec, binkey);

      // convert encrypted Uint8Array to base64
      const encryptedSecret = sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL);

      await octokit.request("PUT /repos/{owner}/{repo}/actions/secrets/{secret_name}", {
        owner: integration.owner,
        repo: integration.app,
        secret_name: key,
        encrypted_value: encryptedSecret,
        key_id: repoPublicKey.key_id
      });
    });
  });
};

/**
 * Sync/push [secrets] to Render service with id [integration.appId]
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for Render integration
 */
const syncSecretsRender = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: IIntegration;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  await standardRequest.put(
    `${INTEGRATION_RENDER_API_URL}/v1/services/${integration.appId}/env-vars`,
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
};

/**
 * Sync/push [secrets] to Laravel Forge sites with id [integration.appId]
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for Laravel Forge integration
 */
const syncSecretsLaravelForge = async ({
  integration,
  secrets,
  accessId,
  accessToken
}: {
  integration: IIntegration;
  secrets: Record<string, { value: string; comment?: string }>;
  accessId: string | null;
  accessToken: string;
}) => {
  function transformObjectToString(obj: any) {
    let result = "";
    for (const key in obj) {
      result += `${key}=${obj[key].value}\n`;
    }
    return result;
  }

  await standardRequest.put(
    `${INTEGRATION_LARAVELFORGE_API_URL}/api/v1/servers/${accessId}/sites/${integration.appId}/env`,
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
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for Railway integration
 */
const syncSecretsRailway = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: IIntegration;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  const query = `
    mutation UpsertVariables($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }
  `;

  const input = {
    projectId: integration.appId,
    environmentId: integration.targetEnvironmentId,
    ...(integration.targetServiceId ? { serviceId: integration.targetServiceId } : {}),
    replace: true,
    variables: getSecretKeyValuePair(secrets)
  };

  await standardRequest.post(
    INTEGRATION_RAILWAY_API_URL,
    {
      query,
      variables: {
        input
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
 * Sync/push [secrets] to Fly.io app
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for Render integration
 */
const syncSecretsFlyio = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: IIntegration;
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

  await standardRequest.post(
    INTEGRATION_FLYIO_API_URL,
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
        Authorization: "Bearer " + accessToken,
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
    await standardRequest.post(
      INTEGRATION_FLYIO_API_URL,
      {
        query: GetSecrets,
        variables: {
          appName: integration.app
        }
      },
      {
        headers: {
          Authorization: "Bearer " + accessToken,
          "Content-Type": "application/json",
          "Accept-Encoding": "application/json"
        }
      }
    )
  ).data.data.app.secrets;

  const deleteSecretsKeys = getSecretsRes
    .filter((secret: FlyioSecret) => !(secret.name in secrets))
    .map((secret: FlyioSecret) => secret.name);

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

  await standardRequest.post(
    INTEGRATION_FLYIO_API_URL,
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
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
        "Accept-Encoding": "application/json"
      }
    }
  );
};

/**
 * Sync/push [secrets] to CircleCI project
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for CircleCI integration
 */
const syncSecretsCircleCI = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: IIntegration;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  const circleciOrganizationDetail = (
    await standardRequest.get(`${INTEGRATION_CIRCLECI_API_URL}/v2/me/collaborations`, {
      headers: {
        "Circle-Token": accessToken,
        "Accept-Encoding": "application/json"
      }
    })
  ).data[0];

  const { slug } = circleciOrganizationDetail;

  // sync secrets to CircleCI
  Object.keys(secrets).forEach(
    async (key) =>
      await standardRequest.post(
        `${INTEGRATION_CIRCLECI_API_URL}/v2/project/${slug}/${integration.app}/envvar`,
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
  );

  // get secrets from CircleCI
  const getSecretsRes = (
    await standardRequest.get(
      `${INTEGRATION_CIRCLECI_API_URL}/v2/project/${slug}/${integration.app}/envvar`,
      {
        headers: {
          "Circle-Token": accessToken,
          "Accept-Encoding": "application/json"
        }
      }
    )
  ).data?.items;

  // delete secrets from CircleCI
  getSecretsRes.forEach(async (sec: any) => {
    if (!(sec.name in secrets)) {
      await standardRequest.delete(
        `${INTEGRATION_CIRCLECI_API_URL}/v2/project/${slug}/${integration.app}/envvar/${sec.name}`,
        {
          headers: {
            "Circle-Token": accessToken,
            "Content-Type": "application/json"
          }
        }
      );
    }
  });
};

/**
 * Sync/push [secrets] to TravisCI project
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for TravisCI integration
 */
const syncSecretsTravisCI = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: IIntegration;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  // get secrets from travis-ci
  const getSecretsRes = (
    await standardRequest.get(
      `${INTEGRATION_TRAVISCI_API_URL}/settings/env_vars?repository_id=${integration.appId}`,
      {
        headers: {
          Authorization: `token ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    )
  ).data?.env_vars.reduce(
    (obj: any, secret: any) => ({
      ...obj,
      [secret.name]: secret
    }),
    {}
  );

  // add secrets
  for await (const key of Object.keys(secrets)) {
    if (!(key in getSecretsRes)) {
      // case: secret does not exist in travis ci
      // -> add secret
      await standardRequest.post(
        `${INTEGRATION_TRAVISCI_API_URL}/settings/env_vars?repository_id=${integration.appId}`,
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
      await standardRequest.patch(
        `${INTEGRATION_TRAVISCI_API_URL}/settings/env_vars/${getSecretsRes[key].id}?repository_id=${getSecretsRes[key].repository_id}`,
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
      await standardRequest.delete(
        `${INTEGRATION_TRAVISCI_API_URL}/settings/env_vars/${getSecretsRes[key].id}?repository_id=${getSecretsRes[key].repository_id}`,
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
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {IIntegrationAuth} obj.integrationAuth - integration auth details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for GitLab integration
 */
const syncSecretsGitLab = async ({
  integrationAuth,
  integration,
  secrets,
  accessToken
}: {
  integrationAuth: IIntegrationAuth;
  integration: IIntegration;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  interface GitLabSecret {
    key: string;
    value: string;
    environment_scope: string;
  }

  const gitLabApiUrl = integrationAuth.url
    ? `${integrationAuth.url}/api`
    : INTEGRATION_GITLAB_API_URL;

  const getAllEnvVariables = async (integrationAppId: string, accessToken: string) => {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Encoding": "application/json",
      "Content-Type": "application/json"
    };

    let allEnvVariables: GitLabSecret[] = [];
    let url:
      | string
      | null = `${gitLabApiUrl}/v4/projects/${integrationAppId}/variables?per_page=100`;

    while (url) {
      const response: any = await standardRequest.get(url, { headers });
      allEnvVariables = [...allEnvVariables, ...response.data];

      const linkHeader = response.headers.link;
      const nextLink = linkHeader?.split(",").find((part: string) => part.includes('rel="next"'));

      if (nextLink) {
        url = nextLink.trim().split(";")[0].slice(1, -1);
      } else {
        url = null;
      }
    }

    return allEnvVariables;
  };

  const allEnvVariables = await getAllEnvVariables(integration?.appId, accessToken);
  const getSecretsRes: GitLabSecret[] = allEnvVariables
    .filter((secret: GitLabSecret) => secret.environment_scope === integration.targetEnvironment)
    .filter((gitLabSecret) => {
      let isValid = true;

      if (
        integration.metadata.secretPrefix &&
        !gitLabSecret.key.startsWith(integration.metadata.secretPrefix)
      ) {
        isValid = false;
      }

      if (
        integration.metadata.secretSuffix &&
        !gitLabSecret.key.endsWith(integration.metadata.secretSuffix)
      ) {
        isValid = false;
      }

      return isValid;
    });

  for await (const key of Object.keys(secrets)) {
    const existingSecret = getSecretsRes.find((s: any) => s.key == key);
    if (!existingSecret) {
      await standardRequest.post(
        `${gitLabApiUrl}/v4/projects/${integration?.appId}/variables`,
        {
          key: key,
          value: secrets[key].value,
          protected: false,
          masked: false,
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
    } else {
      // update secret
      if (secrets[key].value !== existingSecret.value) {
        await standardRequest.put(
          `${gitLabApiUrl}/v4/projects/${integration?.appId}/variables/${existingSecret.key}?filter[environment_scope]=${integration.targetEnvironment}`,
          {
            ...existingSecret,
            value: secrets[existingSecret.key].value
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
  }

  // delete secrets
  for await (const sec of getSecretsRes) {
    if (!(sec.key in secrets)) {
      await standardRequest.delete(
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
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {IIntegrationAuth} obj.integrationAuth - integration auth details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for Supabase integration
 */
const syncSecretsSupabase = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: IIntegration;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  const { data: getSecretsRes } = await standardRequest.get(
    `${INTEGRATION_SUPABASE_API_URL}/v1/projects/${integration.appId}/secrets`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    }
  );

  // convert the secrets to [{}] format
  const modifiedFormatForSecretInjection = Object.keys(secrets).map((key) => {
    return {
      name: key,
      value: secrets[key].value
    };
  });

  await standardRequest.post(
    `${INTEGRATION_SUPABASE_API_URL}/v1/projects/${integration.appId}/secrets`,
    modifiedFormatForSecretInjection,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    }
  );

  const secretsToDelete: any = [];
  getSecretsRes?.forEach((secretObj: any) => {
    if (
      !(secretObj.name in secrets) &&
      // supbase reserved secret ref: https://supabase.com/docs/guides/functions/secrets#default-secrets
      ![
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_DB_URL",
        "SUPABASE_URL"
      ].includes(secretObj.name)
    ) {
      secretsToDelete.push(secretObj.name);
    }
  });

  await standardRequest.delete(
    `${INTEGRATION_SUPABASE_API_URL}/v1/projects/${integration.appId}/secrets`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept-Encoding": "application/json"
      },
      data: secretsToDelete
    }
  );
};

/**
 * Sync/push [secrets] to Checkly app
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for Checkly integration
 */
const syncSecretsCheckly = async ({
  integration,
  secrets,
  accessToken,
  appendices
}: {
  integration: IIntegration;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
  appendices?: { prefix: string; suffix: string };
}) => {
  let getSecretsRes = (
    await standardRequest.get(`${INTEGRATION_CHECKLY_API_URL}/v1/variables`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json",
        "X-Checkly-Account": integration.appId
      }
    })
  ).data.reduce(
    (obj: any, secret: any) => ({
      ...obj,
      [secret.key]: secret.value
    }),
    {}
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
      await standardRequest.post(
        `${INTEGRATION_CHECKLY_API_URL}/v1/variables`,
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
    } else {
      // case: secret exists in checkly
      // -> update/set secret

      if (secrets[key] !== getSecretsRes[key]) {
        await standardRequest.put(
          `${INTEGRATION_CHECKLY_API_URL}/v1/variables/${key}`,
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
    }
  }

  for await (const key of Object.keys(getSecretsRes)) {
    if (!(key in secrets)) {
      // delete secret
      await standardRequest.delete(`${INTEGRATION_CHECKLY_API_URL}/v1/variables/${key}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "X-Checkly-Account": integration.appId
        }
      });
    }
  }
};

/**
 * Sync/push [secrets] to Qovery app
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for Qovery integration
 */
const syncSecretsQovery = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: IIntegration;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  const getSecretsRes = (
    await standardRequest.get(
      `${INTEGRATION_QOVERY_API_URL}/${integration.scope}/${integration.appId}/environmentVariable`,
      {
        headers: {
          Authorization: `Token ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    )
  ).data.results.reduce(
    (obj: any, secret: any) => ({
      ...obj,
      [secret.key]: { id: secret.id, value: secret.value }
    }),
    {}
  );

  // add secrets
  for await (const key of Object.keys(secrets)) {
    if (!(key in getSecretsRes)) {
      // case: secret does not exist in qovery
      // -> add secret
      await standardRequest.post(
        `${INTEGRATION_QOVERY_API_URL}/${integration.scope}/${integration.appId}/environmentVariable`,
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
    } else {
      // case: secret exists in qovery
      // -> update/set secret

      if (secrets[key].value !== getSecretsRes[key].value) {
        await standardRequest.put(
          `${INTEGRATION_QOVERY_API_URL}/${integration.scope}/${integration.appId}/environmentVariable/${getSecretsRes[key].id}`,
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
  }

  // This one is dangerous because there might be a lot of qovery-specific secrets

  // for await (const key of Object.keys(getSecretsRes)) {
  //   if (!(key in secrets)) {
  //     console.log(3)
  //     // delete secret
  //     await standardRequest.delete(`${INTEGRATION_QOVERY_API_URL}/application/${integration.appId}/environmentVariable/${getSecretsRes[key].id}`, {
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
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for Terraform Cloud API
 */
const syncSecretsTerraformCloud = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: IIntegration;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  // get secrets from Terraform Cloud
  const getSecretsRes = (
    await standardRequest.get(
      `${INTEGRATION_TERRAFORM_CLOUD_API_URL}/api/v2/workspaces/${integration.appId}/vars`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      }
    )
  ).data.data.reduce(
    (obj: any, secret: any) => ({
      ...obj,
      [secret.attributes.key]: secret
    }),
    {}
  );

  // create or update secrets on Terraform Cloud
  for await (const key of Object.keys(secrets)) {
    if (!(key in getSecretsRes)) {
      // case: secret does not exist in Terraform Cloud
      // -> add secret
      await standardRequest.post(
        `${INTEGRATION_TERRAFORM_CLOUD_API_URL}/api/v2/workspaces/${integration.appId}/vars`,
        {
          data: {
            type: "vars",
            attributes: {
              key,
              value: secrets[key].value,
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
    } else {
      // case: secret exists in Terraform Cloud
      if (secrets[key].value !== getSecretsRes[key].attributes.value) {
        // -> update secret
        await standardRequest.patch(
          `${INTEGRATION_TERRAFORM_CLOUD_API_URL}/api/v2/workspaces/${integration.appId}/vars/${getSecretsRes[key].id}`,
          {
            data: {
              type: "vars",
              id: getSecretsRes[key].id,
              attributes: {
                ...getSecretsRes[key],
                value: secrets[key].value
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
  }

  for await (const key of Object.keys(getSecretsRes)) {
    if (!(key in secrets)) {
      // case: delete secret
      await standardRequest.delete(
        `${INTEGRATION_TERRAFORM_CLOUD_API_URL}/api/v2/workspaces/${integration.appId}/vars/${getSecretsRes[key].id}`,
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
};

/**
 * Sync/push [secrets] to TeamCity project (and optionally build config)
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration
 * @param {String} obj.accessToken - access token for TeamCity integration
 */
const syncSecretsTeamCity = async ({
  integrationAuth,
  integration,
  secrets,
  accessToken
}: {
  integrationAuth: IIntegrationAuth;
  integration: IIntegration;
  secrets: any;
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
      await standardRequest.get<GetTeamCityBuildConfigParametersRes>(
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
      .reduce((obj: any, secret: TeamCitySecret) => {
        const secretName = secret.name.replace(/^env\./, "");
        return {
          ...obj,
          [secretName]: secret.value
        };
      }, {});

    for await (const key of Object.keys(secrets)) {
      if (!(key in res) || (key in res && secrets[key].value !== res[key])) {
        // case: secret does not exist in TeamCity or secret value has changed
        // -> create/update secret
        await standardRequest.post(
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
        await standardRequest.delete(
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
      await standardRequest.get(
        `${integrationAuth.url}/app/rest/projects/id:${integration.appId}/parameters`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
          }
        }
      )
    ).data.property.reduce((obj: any, secret: TeamCitySecret) => {
      const secretName = secret.name.replace(/^env\./, "");
      return {
        ...obj,
        [secretName]: secret.value
      };
    }, {});

    for await (const key of Object.keys(secrets)) {
      if (!(key in res) || (key in res && secrets[key] !== res[key])) {
        // case: secret does not exist in TeamCity or secret value has changed
        // -> create/update secret
        await standardRequest.post(
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
        await standardRequest.delete(
          `${integrationAuth.url}/app/rest/projects/id:${integration.appId}/parameters/env.${key}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json"
            }
          }
        );
      }
    }
  }
};

/**
 * Sync/push [secrets] to HashiCorp Vault path
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for HashiCorp Vault integration
 */
const syncSecretsHashiCorpVault = async ({
  integration,
  integrationAuth,
  secrets,
  accessId,
  accessToken
}: {
  integration: IIntegration;
  integrationAuth: IIntegrationAuth;
  secrets: Record<string, { value: string; comment?: string }>;
  accessId: string | null;
  accessToken: string;
}) => {
  if (!accessId) return;

  interface LoginAppRoleRes {
    auth: {
      client_token: string;
    };
  }

  // get Vault client token (could be optimized)
  const { data }: { data: LoginAppRoleRes } = await standardRequest.post(
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

  await standardRequest.post(
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
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - API token for Cloudflare
 */
const syncSecretsCloudflarePages = async ({
  integration,
  secrets,
  accessId,
  accessToken
}: {
  integration: IIntegration;
  secrets: Record<string, { value: string; comment?: string }>;
  accessId: string | null;
  accessToken: string;
}) => {
  // get secrets from cloudflare pages
  const getSecretsRes = (
    await standardRequest.get(
      `${INTEGRATION_CLOUDFLARE_PAGES_API_URL}/client/v4/accounts/${accessId}/pages/projects/${integration.app}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      }
    )
  ).data.result["deployment_configs"][integration.targetEnvironment]["env_vars"];

  // copy the secrets object, so we can set deleted keys to null
  const secretsObj: any = getSecretKeyValuePair(secrets);

  for (const [key, val] of Object.entries(secretsObj)) {
    secretsObj[key] = { type: "secret_text", value: val };
  }

  if (getSecretsRes) {
    for await (const key of Object.keys(getSecretsRes)) {
      if (!(key in secrets)) {
        // case: secret does not exist in infisical
        // -> delete secret from cloudflare pages
        secretsObj[key] = null;
      }
    }
  }

  const data = {
    deployment_configs: {
      [integration.targetEnvironment]: {
        env_vars: secretsObj
      }
    }
  };

  await standardRequest.patch(
    `${INTEGRATION_CLOUDFLARE_PAGES_API_URL}/client/v4/accounts/${accessId}/pages/projects/${integration.app}`,
    data,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    }
  );
};

/**
 * Sync/push [secrets] to BitBucket repo with name [integration.app]
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {IIntegrationAuth} obj.integrationAuth - integration auth details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for BitBucket integration
 */
const syncSecretsBitBucket = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: IIntegration;
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
  let variablesUrl = `${INTEGRATION_BITBUCKET_API_URL}/2.0/repositories/${integration.targetEnvironmentId}/${integration.appId}/pipelines_config/variables`;

  while (hasNextPage) {
    const { data }: { data: VariablesResponse } = await standardRequest.get(variablesUrl, {
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
      await standardRequest.put(
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
      await standardRequest.post(
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
      await standardRequest.delete(`${variablesUrl}/${res[key].uuid}`, {
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
 * @param {IIntegration} obj.integration - integration details
 * @param {IIntegrationAuth} obj.integrationAuth - integration auth details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for Codefresh integration
 */
const syncSecretsCodefresh = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: IIntegration;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  await standardRequest.patch(
    `${INTEGRATION_CODEFRESH_API_URL}/projects/${integration.appId}`,
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
 * @param {IIntegration} obj.integration - integration details
 * @param {IIntegrationAuth} obj.integrationAuth - integration auth details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for integration
 */
const syncSecretsDigitalOceanAppPlatform = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: IIntegration;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  // get current app settings
  const appSettings = (
    await standardRequest.get(`${INTEGRATION_DIGITAL_OCEAN_API_URL}/v2/apps/${integration.appId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    })
  ).data.app.spec;

  await standardRequest.put(
    `${INTEGRATION_DIGITAL_OCEAN_API_URL}/v2/apps/${integration.appId}`,
    {
      spec: {
        name: integration.app,
        ...appSettings,
        envs: Object.entries(secrets).map(([key, data]) => ({ key, value: data.value }))
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
 * @param {IIntegration} obj.integration - integration details
 * @param {IIntegrationAuth} obj.integrationAuth - integration auth details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for windmill integration
 * @param {Object} obj.secretComments - secret comments to push to integration (object where keys are secret keys and values are comment values)
 */
const syncSecretsWindmill = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: IIntegration;
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
    await standardRequest.get(
      `${INTEGRATION_WINDMILL_API_URL}/w/${integration.appId}/variables/list`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    )
  ).data.reduce(
    (obj: any, secret: WindmillSecret) => ({
      ...obj,
      [secret.path]: secret
    }),
    {}
  );

  // eslint-disable-next-line no-useless-escape
  const pattern = new RegExp("^(u/|f/)[a-zA-Z0-9_-]+/([a-zA-Z0-9_-]+/)*[a-zA-Z0-9_-]*[^/]$");

  for await (const key of Object.keys(secrets)) {
    if ((key.startsWith("u/") || key.startsWith("f/")) && pattern.test(key)) {
      if (!(key in res)) {
        // case: secret does not exist in windmill
        // -> create secret

        await standardRequest.post(
          `${INTEGRATION_WINDMILL_API_URL}/w/${integration.appId}/variables/create`,
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
        await standardRequest.post(
          `${INTEGRATION_WINDMILL_API_URL}/w/${integration.appId}/variables/update/${res[key].path}`,
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
      await standardRequest.delete(
        `${INTEGRATION_WINDMILL_API_URL}/w/${integration.appId}/variables/delete/${res[key].path}`,
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
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {IIntegrationAuth} obj.integrationAuth - integration auth details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for Cloud66 integration
 */
const syncSecretsCloud66 = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: IIntegration;
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
    history: any[];
  }

  // get all current secrets
  const res = (
    await standardRequest.get(
      `${INTEGRATION_CLOUD_66_API_URL}/3/stacks/${integration.appId}/environments`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      }
    )
  ).data.response
    .filter((secret: Cloud66Secret) => !secret.readonly || !secret.is_generated)
    .reduce(
      (obj: any, secret: any) => ({
        ...obj,
        [secret.key]: secret
      }),
      {}
    );

  for await (const key of Object.keys(secrets)) {
    if (key in res) {
      // update existing secret
      await standardRequest.put(
        `${INTEGRATION_CLOUD_66_API_URL}/3/stacks/${integration.appId}/environments/${key}`,
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
      await standardRequest.post(
        `${INTEGRATION_CLOUD_66_API_URL}/3/stacks/${integration.appId}/environments`,
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
      await standardRequest.delete(
        `${INTEGRATION_CLOUD_66_API_URL}/3/stacks/${integration.appId}/environments/${key}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
          }
        }
      );
    }
  }
};

/** Sync/push [secrets] to Northflank
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for Northflank integration
 */
const syncSecretsNorthflank = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: IIntegration;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  await standardRequest.patch(
    `${INTEGRATION_NORTHFLANK_API_URL}/v1/projects/${integration.appId}/secrets/${integration.targetServiceId}`,
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
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for Hasura Cloud integration
 */
const syncSecretsHasuraCloud = async ({
  integration,
  secrets,
  accessToken
}: {
  integration: IIntegration;
  secrets: Record<string, { value: string; comment?: string }>;
  accessToken: string;
}) => {
  const res = await standardRequest.post(
    INTEGRATION_HASURA_CLOUD_API_URL,
    {
      query:
        "query MyQuery($tenantId: uuid!) { getTenantEnv(tenantId: $tenantId) { hash envVars } }",
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

  const secretsToUpdate = Object.keys(secrets).map((key) => {
    return ({
      key,
      value: secrets[key].value
    });
  });

  if (secretsToUpdate.length) {
    // update secrets
    
    const addRequest = await standardRequest.post(
      INTEGRATION_HASURA_CLOUD_API_URL,
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
    await standardRequest.post(
      INTEGRATION_HASURA_CLOUD_API_URL,
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

export { syncSecrets };
