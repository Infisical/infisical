import _ from 'lodash';
import AWS from 'aws-sdk';
import { 
  SecretsManagerClient, 
  UpdateSecretCommand,
  CreateSecretCommand,
  GetSecretValueCommand,
  ResourceNotFoundException
} from '@aws-sdk/client-secrets-manager';
import { Octokit } from "@octokit/rest";
import sodium from "libsodium-wrappers";
import { IIntegration, IIntegrationAuth } from "../models";
import {
  INTEGRATION_AZURE_KEY_VAULT,
  INTEGRATION_AWS_PARAMETER_STORE,
  INTEGRATION_AWS_SECRET_MANAGER,
  INTEGRATION_HEROKU,
  INTEGRATION_VERCEL,
  INTEGRATION_NETLIFY,
  INTEGRATION_GITHUB,
  INTEGRATION_GITLAB,
  INTEGRATION_RENDER,
  INTEGRATION_RAILWAY,
  INTEGRATION_FLYIO,
  INTEGRATION_CIRCLECI,
  INTEGRATION_TRAVISCI,
  INTEGRATION_SUPABASE,
  INTEGRATION_HEROKU_API_URL,
  INTEGRATION_GITLAB_API_URL,
  INTEGRATION_VERCEL_API_URL,
  INTEGRATION_NETLIFY_API_URL,
  INTEGRATION_RENDER_API_URL,
  INTEGRATION_RAILWAY_API_URL,
  INTEGRATION_FLYIO_API_URL,
  INTEGRATION_CIRCLECI_API_URL,
  INTEGRATION_TRAVISCI_API_URL,
  INTEGRATION_SUPABASE_API_URL
} from "../variables";
import { standardRequest} from '../config/request';

/**
 * Sync/push [secrets] to [app] in integration named [integration]
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {IIntegrationAuth} obj.integrationAuth - integration auth details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessId - access id for integration
 * @param {String} obj.accessToken - access token for integration
 */
const syncSecrets = async ({
  integration,
  integrationAuth,
  secrets,
  accessId,
  accessToken,
}: {
  integration: IIntegration;
  integrationAuth: IIntegrationAuth;
  secrets: any;
  accessId: string | null;
  accessToken: string;
}) => {
  switch (integration.integration) {
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
        accessToken,
      });
      break;
    case INTEGRATION_VERCEL:
      await syncSecretsVercel({
        integration,
        integrationAuth,
        secrets,
        accessToken,
      });
      break;
    case INTEGRATION_NETLIFY:
      await syncSecretsNetlify({
        integration,
        integrationAuth,
        secrets,
        accessToken,
      });
      break;
    case INTEGRATION_GITHUB:
      await syncSecretsGitHub({
        integration,
        secrets,
        accessToken,
      });
      break;
    case INTEGRATION_GITLAB:
      await syncSecretsGitLab({
        integration,
        secrets,
        accessToken,
      });
      break;
    case INTEGRATION_RENDER:
      await syncSecretsRender({
        integration,
        secrets,
        accessToken,
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
        accessToken,
      });
      break;
    case INTEGRATION_CIRCLECI:
      await syncSecretsCircleCI({
        integration,
        secrets,
        accessToken,
      });
      break;
    case INTEGRATION_TRAVISCI:
      await syncSecretsTravisCI({
        integration,
        secrets,
        accessToken,
      });
      break;
    case INTEGRATION_SUPABASE:
      await syncSecretsSupabase({
          integration,
          secrets,
          accessToken
      });
      break;
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
  secrets: any;
  accessToken: string;
}) => {
  interface GetAzureKeyVaultSecret {
    id: string; // secret URI
    attributes: {
      enabled: true,
      created: number;
      updated: number;
      recoveryLevel: string;
      recoverableDays: number;
    }
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
  }
  
  const getAzureKeyVaultSecrets = await paginateAzureKeyVaultSecrets(`${integration.app}/secrets?api-version=7.3`);
  
  let lastSlashIndex: number;
  const res = (await Promise.all(getAzureKeyVaultSecrets.map(async (getAzureKeyVaultSecret) => {
    if (!lastSlashIndex) {
      lastSlashIndex = getAzureKeyVaultSecret.id.lastIndexOf('/');
    }
    
    const azureKeyVaultSecret = await standardRequest.get(`${getAzureKeyVaultSecret.id}?api-version=7.3`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    return ({
      ...azureKeyVaultSecret.data,
      key: getAzureKeyVaultSecret.id.substring(lastSlashIndex + 1),
    });
  })))
  .reduce((obj: any, secret: any) => ({
      ...obj,
      [secret.key]: secret
  }), {});
  
  const setSecrets: {
    key: string;
    value: string;
  }[] = [];

  Object.keys(secrets).forEach((key) => {
    const hyphenatedKey = key.replace(/_/g, '-');
    if (!(hyphenatedKey in res)) {
      // case: secret has been created
      setSecrets.push({
        key: hyphenatedKey,
        value: secrets[key]
      });
    } else {
      if (secrets[key] !== res[hyphenatedKey].value) {
        // case: secret has been updated
        setSecrets.push({
          key: hyphenatedKey,
          value: secrets[key]
        });
      }
    }
  });
  
  const deleteSecrets: AzureKeyVaultSecret[] = [];
  
  Object.keys(res).forEach((key) => {
    const underscoredKey = key.replace(/-/g, '_');
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
        if (error?.response?.data?.error?.innererror?.code === 'ObjectIsDeletedButRecoverable') {
          await standardRequest.post(
            `${integration.app}/deletedsecrets/${key}/recover?api-version=7.3`, {},
            {
              headers: {
                Authorization: `Bearer ${accessToken}`
              }
            }
          );
          await new Promise(resolve => setTimeout(resolve, 10000));
        } else {
          await new Promise(resolve => setTimeout(resolve, 10000));
          maxTries--;
        }
      }
    }
  }
  
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
        'Authorization': `Bearer ${accessToken}`
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
  secrets: any;
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
    apiVersion: '2014-11-06',
    region: integration.region
  });
  
  const params = {
    Path: integration.path,
    Recursive: true,
    WithDecryption: true
  };

  const parameterList = (await ssm.getParametersByPath(params).promise()).Parameters
  
  let awsParameterStoreSecretsObj: {
    [key: string]: any // TODO: fix type
  } = {};

  if (parameterList) {
    awsParameterStoreSecretsObj = parameterList.reduce((obj: any, secret: any) => ({
        ...obj,
        [secret.Name.split("/").pop()]: secret
    }), {});
  }

  // Identify secrets to create
  Object.keys(secrets).map(async (key) => {
      if (!(key in awsParameterStoreSecretsObj)) {
        // case: secret does not exist in AWS parameter store
        // -> create secret
        await ssm.putParameter({
          Name: `${integration.path}${key}`,
          Type: 'SecureString',
          Value: secrets[key],
          Overwrite: true
        }).promise();
      } else {
        // case: secret exists in AWS parameter store
        
        if (awsParameterStoreSecretsObj[key].Value !== secrets[key]) {
          // case: secret value doesn't match one in AWS parameter store
          // -> update secret
          await ssm.putParameter({
            Name: `${integration.path}${key}`,
            Type: 'SecureString',
            Value: secrets[key],
            Overwrite: true
          }).promise();
        }
      }
  });

  // Identify secrets to delete
  Object.keys(awsParameterStoreSecretsObj).map(async (key) => {
      if (!(key in secrets)) {
        // case: 
        // -> delete secret
        await ssm.deleteParameter({
          Name: awsParameterStoreSecretsObj[key].Name
        }).promise();
      }
  });

  AWS.config.update({
    region: undefined,
    accessKeyId: undefined,
    secretAccessKey: undefined
  }); 
}

/**
 * Sync/push [secrets] to AWS secret manager
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessId - access id for AWS secret manager integration
 * @param {String} obj.accessToken - access token for AWS secret manager integration
 */
const syncSecretsAWSSecretManager = async ({
  integration,
  secrets,
  accessId,
  accessToken
}: {
  integration: IIntegration;
  secrets: any;
  accessId: string | null;
  accessToken: string;
}) => {
  let secretsManager;
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
    
    if (!_.isEqual(awsSecretManagerSecretObj, secrets)) {
      await secretsManager.send(new UpdateSecretCommand({
        SecretId: integration.app,
        SecretString: JSON.stringify(secrets)
      }));
    }

    AWS.config.update({
      region: undefined,
      accessKeyId: undefined,
      secretAccessKey: undefined
    }); 
  } catch (err) {
    if (err instanceof ResourceNotFoundException && secretsManager) {
      await secretsManager.send(new CreateSecretCommand({
        Name: integration.app,
        SecretString: JSON.stringify(secrets)
      }));
    } 
    AWS.config.update({
      region: undefined,
      accessKeyId: undefined,
      secretAccessKey: undefined
    }); 
  }
}

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
  accessToken,
}: {
  integration: IIntegration;
  secrets: any;
  accessToken: string;
}) => {
  const herokuSecrets = (
    await standardRequest.get(
      `${INTEGRATION_HEROKU_API_URL}/apps/${integration.app}/config-vars`,
      {
        headers: {
          Accept: "application/vnd.heroku+json; version=3",
          Authorization: `Bearer ${accessToken}`,
          'Accept-Encoding': 'application/json'
        },
      }
    )
  ).data;

  Object.keys(herokuSecrets).forEach((key) => {
    if (!(key in secrets)) {
      secrets[key] = null;
    }
  });

  await standardRequest.patch(
    `${INTEGRATION_HEROKU_API_URL}/apps/${integration.app}/config-vars`,
    secrets,
    {
      headers: {
        Accept: "application/vnd.heroku+json; version=3",
        Authorization: `Bearer ${accessToken}`,
        'Accept-Encoding': 'application/json'
      },
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
  accessToken,
}: {
  integration: IIntegration;
  integrationAuth: IIntegrationAuth;
  secrets: any;
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
          teamId: integrationAuth.teamId,
        }
      : {}),
  };
    
  const vercelSecrets: VercelSecret[] = (await standardRequest.get(
    `${INTEGRATION_VERCEL_API_URL}/v9/projects/${integration.app}/env`,
    {
      params,
      headers: {
          Authorization: `Bearer ${accessToken}`,
          'Accept-Encoding': 'application/json'
      }
    }
  ))
  .data
  .envs
  .filter((secret: VercelSecret) => { 
    if (!secret.target.includes(integration.targetEnvironment)) {
      // case: secret does not have the same target environment
      return false;
    }

    if (integration.targetEnvironment === 'preview' && integration.path && integration.path !== secret.gitBranch) {
      // case: secret on preview environment does not have same target git branch
      return false;
    }

    return true;
  });

  // return secret.target.includes(integration.targetEnvironment);

  const res: { [key: string]: VercelSecret } = {};

  for await (const vercelSecret of vercelSecrets) {
    if (vercelSecret.type === 'encrypted') {
      // case: secret is encrypted -> need to decrypt
      const decryptedSecret = (await standardRequest.get(
          `${INTEGRATION_VERCEL_API_URL}/v9/projects/${integration.app}/env/${vercelSecret.id}`,
          {
            params,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Accept-Encoding': 'application/json'
            }
          }
      )).data;

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
        value: secrets[key],
        type: "encrypted",
        target: [integration.targetEnvironment],
        ...(integration.path ? {
          gitBranch: integration.path
        } : {})
      });
    }
  });

  // Identify secrets to update and delete
  Object.keys(res).map((key) => {
    if (key in secrets) {
      if (res[key].value !== secrets[key]) {
        // case: secret value has changed
        updateSecrets.push({
          id: res[key].id,
          key: key,
          value: secrets[key],
          type: res[key].type,
          target: res[key].target.includes(integration.targetEnvironment) 
          ? [...res[key].target] 
          : [...res[key].target, integration.targetEnvironment],
          ...(integration.path ? {
            gitBranch: integration.path
          } : {})
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
        ...(integration.path ? {
          gitBranch: integration.path
        } : {})
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
          'Accept-Encoding': 'application/json'
        },
      }
    );
  }

  for await (const secret of updateSecrets) {
    if (secret.type !== 'sensitive') {
      const { id, ...updatedSecret } = secret;
      await standardRequest.patch(
        `${INTEGRATION_VERCEL_API_URL}/v9/projects/${integration.app}/env/${secret.id}`,
        updatedSecret,
        {
          params,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Accept-Encoding': 'application/json'
          },
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
          'Accept-Encoding': 'application/json'
        },
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
  accessToken,
}: {
  integration: IIntegration;
  integrationAuth: IIntegrationAuth;
  secrets: any;
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

  interface NetlifySecretsRes {
    [index: string]: NetlifySecret;
  }

  const getParams = new URLSearchParams({
    context_name: "all", // integration.context or all
    site_id: integration.appId,
  });

  const res = (
    await standardRequest.get(
      `${INTEGRATION_NETLIFY_API_URL}/api/v1/accounts/${integrationAuth.accountId}/env`,
      {
        params: getParams,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Accept-Encoding': 'application/json'
        },
      }
    )
  ).data.reduce(
    (obj: any, secret: any) => ({
      ...obj,
      [secret.key]: secret,
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
            value: secrets[key],
            context: integration.targetEnvironment,
          },
        ],
      });
    } else {
      // case: Infisical secret exists in Netlify
      const contexts = res[key].values.reduce(
        (obj: any, value: NetlifyValue) => ({
          ...obj,
          [value.context]: value,
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
                value: secrets[key],
              },
            ],
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
              value: secrets[key],
            },
          ],
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
                  value: value.value,
                },
              ],
            });
          }
        }
      });
    }
  });

  const syncParams = new URLSearchParams({
    site_id: integration.appId,
  });

  if (newSecrets.length > 0) {
    await standardRequest.post(
      `${INTEGRATION_NETLIFY_API_URL}/api/v1/accounts/${integrationAuth.accountId}/env`,
      newSecrets,
      {
        params: syncParams,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Accept-Encoding': 'application/json'
        },
      }
    );
  }

  if (updateSecrets.length > 0) {
    updateSecrets.forEach(async (secret: NetlifySecret) => {
      await standardRequest.patch(
        `${INTEGRATION_NETLIFY_API_URL}/api/v1/accounts/${integrationAuth.accountId}/env/${secret.key}`,
        {
          context: secret.values[0].context,
          value: secret.values[0].value,
        },
        {
          params: syncParams,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Accept-Encoding': 'application/json'
          },
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
            'Accept-Encoding': 'application/json'
          },
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
            'Accept-Encoding': 'application/json'
          },
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
}: {
  integration: IIntegration;
  secrets: any;
  accessToken: string;
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

  const deleteSecrets: GitHubSecret[] = [];

  const octokit = new Octokit({
    auth: accessToken,
  });

  // const user = (await octokit.request('GET /user', {})).data;
  const repoPublicKey: GitHubRepoKey = (
    await octokit.request(
      "GET /repos/{owner}/{repo}/actions/secrets/public-key",
      {
        owner: integration.owner,
        repo: integration.app
      }
    )
  ).data;

  // Get local copy of decrypted secrets. We cannot decrypt them as we dont have access to GH private key
  const encryptedSecrets: GitHubSecretRes = (
    await octokit.request("GET /repos/{owner}/{repo}/actions/secrets", {
      owner: integration.owner,
      repo: integration.app,
    })
  ).data.secrets.reduce(
    (obj: any, secret: any) => ({
      ...obj,
      [secret.name]: secret,
    }),
    {}
  );

  Object.keys(encryptedSecrets).map(async (key) => {
    if (!(key in secrets)) {
      await octokit.request(
        "DELETE /repos/{owner}/{repo}/actions/secrets/{secret_name}",
        {
          owner: integration.owner,
          repo: integration.app,
          secret_name: key,
        }
      );
    }
  });

  Object.keys(secrets).map((key) => {
    // let encryptedSecret;
    sodium.ready.then(async () => {
      // convert secret & base64 key to Uint8Array.
      const binkey = sodium.from_base64(
        repoPublicKey.key,
        sodium.base64_variants.ORIGINAL
      );
      const binsec = sodium.from_string(secrets[key]);

      // encrypt secret using libsodium
      const encBytes = sodium.crypto_box_seal(binsec, binkey);

      // convert encrypted Uint8Array to base64
      const encryptedSecret = sodium.to_base64(
        encBytes,
        sodium.base64_variants.ORIGINAL
      );

      await octokit.request(
        "PUT /repos/{owner}/{repo}/actions/secrets/{secret_name}",
        {
          owner: integration.owner,
          repo: integration.app,
          secret_name: key,
          encrypted_value: encryptedSecret,
          key_id: repoPublicKey.key_id,
        }
      );
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
  accessToken,
}: {
  integration: IIntegration;
  secrets: any;
  accessToken: string;
}) => {
  await standardRequest.put(
    `${INTEGRATION_RENDER_API_URL}/v1/services/${integration.appId}/env-vars`,
    Object.keys(secrets).map((key) => ({
      key,
      value: secrets[key],
    })),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Accept-Encoding': 'application/json'
      },
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
  secrets: any;
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
    variables: secrets
  };

  await standardRequest.post(INTEGRATION_RAILWAY_API_URL, {
    query,
    variables: {
      input,
    },
  }, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'application/json'
    },
  });
}

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
  accessToken,
}: {
  integration: IIntegration;
  secrets: any;
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

  await standardRequest.post(INTEGRATION_FLYIO_API_URL, {
    query: SetSecrets,
    variables: {
      input: {
        appId: integration.app,
        secrets: Object.entries(secrets).map(([key, value]) => ({
          key,
          value,
        })),
      },
    },
  }, {
    headers: {
      Authorization: "Bearer " + accessToken,
      'Accept-Encoding': 'application/json',
    },
  });

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

  const getSecretsRes = (await standardRequest.post(INTEGRATION_FLYIO_API_URL, {
    query: GetSecrets,
    variables: {
      appName: integration.app,
    },
  }, {
    headers: {
      Authorization: "Bearer " + accessToken,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'application/json',
    },
  })).data.data.app.secrets;

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

  await standardRequest.post(INTEGRATION_FLYIO_API_URL, {
    query: DeleteSecrets,
    variables: {
      input: {
        appId: integration.app,
        keys: deleteSecretsKeys,
      },
    },
  }, {
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
      'Accept-Encoding': 'application/json',
    },
  });
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
  accessToken,
}: {
  integration: IIntegration;
  secrets: any;
  accessToken: string;
}) => {  
  const circleciOrganizationDetail = (
    await standardRequest.get(`${INTEGRATION_CIRCLECI_API_URL}/v2/me/collaborations`, {
      headers: {
        "Circle-Token": accessToken,
        "Accept-Encoding": "application/json",
      },
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
          value: secrets[key],
        },
        {
          headers: {
            "Circle-Token": accessToken,
            "Content-Type": "application/json",
          },
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
          "Accept-Encoding": "application/json",
        },
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
            "Content-Type": "application/json",
          },
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
  accessToken,
}: {
  integration: IIntegration;
  secrets: any;
  accessToken: string;
}) => {
  // get secrets from travis-ci  
  const getSecretsRes = (
    await standardRequest.get(
      `${INTEGRATION_TRAVISCI_API_URL}/settings/env_vars?repository_id=${integration.appId}`,
      {
        headers: {
          "Authorization": `token ${accessToken}`,
          "Accept-Encoding": "application/json",
        },
      }
    )
  )
  .data
  ?.env_vars
  .reduce((obj: any, secret: any) => ({
      ...obj,
      [secret.name]: secret
  }), {});
  
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
            value: secrets[key]
          }
        },
        {
          headers: {
            "Authorization": `token ${accessToken}`,
            "Content-Type": "application/json",
            "Accept-Encoding": "application/json",
          },
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
            value: secrets[key],
          }
        },
        {
          headers: {
            "Authorization": `token ${accessToken}`,
            "Content-Type": "application/json",
            "Accept-Encoding": "application/json",
          },
        }
      );
    }
  }

  for await (const key of Object.keys(getSecretsRes)) {
    if (!(key in secrets)){
      // delete secret
      await standardRequest.delete(
        `${INTEGRATION_TRAVISCI_API_URL}/settings/env_vars/${getSecretsRes[key].id}?repository_id=${getSecretsRes[key].repository_id}`,
        {
          headers: {
            "Authorization": `token ${accessToken}`,
            "Content-Type": "application/json",
            "Accept-Encoding": "application/json",
          },
        }
      );
    }
  }
}

/**
 * Sync/push [secrets] to GitLab repo with name [integration.app]
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {IIntegrationAuth} obj.integrationAuth - integration auth details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for GitLab integration
 */
const syncSecretsGitLab = async ({
  integration,
  secrets,
  accessToken,
}: {
  integration: IIntegration;
  secrets: any;
  accessToken: string;
}) => {
  interface GitLabSecret {
    key: string;
    value: string;
    environment_scope: string;
  }

  const getAllEnvVariables = async (integrationAppId: string, accessToken: string) => {
    const gitLabApiUrl = `${INTEGRATION_GITLAB_API_URL}/v4/projects/${integrationAppId}/variables`;
    const headers = {
      "Authorization": `Bearer ${accessToken}`,
      "Accept-Encoding": "application/json",
    };
  
    let allEnvVariables: GitLabSecret[] = [];
    let url: string | null = `${gitLabApiUrl}?per_page=100`;
  
    while (url) {
      const response: any = await standardRequest.get(url, { headers });
      allEnvVariables = [...allEnvVariables, ...response.data];
  
      const linkHeader = response.headers.link;
      const nextLink = linkHeader?.split(',').find((part: string) => part.includes('rel="next"'));
  
      if (nextLink) {
        url = nextLink.trim().split(';')[0].slice(1, -1);
      } else {
        url = null;
      }
    }
  
    return allEnvVariables;
  };

  const allEnvVariables = await getAllEnvVariables(integration?.appId, accessToken);
  const getSecretsRes: GitLabSecret[] = allEnvVariables.filter((secret: GitLabSecret) => 
    secret.environment_scope === integration.targetEnvironment
  );

  for await (const key of Object.keys(secrets)) {
    const existingSecret = getSecretsRes.find((s: any) => s.key == key);
    if (!existingSecret) {
      await standardRequest.post(
        `${INTEGRATION_GITLAB_API_URL}/v4/projects/${integration?.appId}/variables`,
        {
          key: key,
          value: secrets[key],
          protected: false,
          masked: false,
          raw: false,
          environment_scope: integration.targetEnvironment
        },
        {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Accept-Encoding": "application/json",
          },
        }
      )
    } else {
      // update secret 
      if (secrets[key] !== existingSecret.value) {
        await standardRequest.put(
          `${INTEGRATION_GITLAB_API_URL}/v4/projects/${integration?.appId}/variables/${existingSecret.key}?filter[environment_scope]=${integration.targetEnvironment}`,
          {
            ...existingSecret,
            value: secrets[existingSecret.key]
          },
          {
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "Accept-Encoding": "application/json",
            },
          }
        );
      }
    }
  }

  // delete secrets 
  for await (const sec of getSecretsRes) {
    if (!(sec.key in secrets)) {
      await standardRequest.delete(
        `${INTEGRATION_GITLAB_API_URL}/v4/projects/${integration?.appId}/variables/${sec.key}?filter[environment_scope]=${integration.targetEnvironment}`,
        {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
          },
        }
      );
    }
  }
}

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
  secrets: any;
  accessToken: string;
}) => {
  const { data: getSecretsRes } = await standardRequest.get(
    `${INTEGRATION_SUPABASE_API_URL}/v1/projects/${integration.appId}/secrets`,
    {
      headers: {
          Authorization: `Bearer ${accessToken}`,
          'Accept-Encoding': 'application/json'
      }
    }
  );

  // convert the secrets to [{}] format
  const modifiedFormatForSecretInjection = Object.keys(secrets).map(
    (key) => {
      return {
          name: key,
          value: secrets[key]
      };
    }
  );

  await standardRequest.post(
    `${INTEGRATION_SUPABASE_API_URL}/v1/projects/${integration.appId}/secrets`,
    modifiedFormatForSecretInjection,
    {
      headers: {
          Authorization: `Bearer ${accessToken}`,
          'Accept-Encoding': 'application/json'
      }
    }
  );

  const secretsToDelete: any = [];
  getSecretsRes?.forEach((secretObj: any) => {
    if (!(secretObj.name in secrets)) {
        secretsToDelete.push(secretObj.name);
    }
  });

  await standardRequest.delete(
    `${INTEGRATION_SUPABASE_API_URL}/v1/projects/${integration.appId}/secrets`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept-Encoding': 'application/json'
      },
      data: secretsToDelete
    }
  );
};


export { syncSecrets };
