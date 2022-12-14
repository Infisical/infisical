import axios from 'axios';
import * as Sentry from '@sentry/node';
import {
    IIntegration, IIntegrationAuth
} from '../models';
import { 
    INTEGRATION_HEROKU,
    INTEGRATION_VERCEL,
    INTEGRATION_NETLIFY,
    INTEGRATION_HEROKU_API_URL,
    INTEGRATION_VERCEL_API_URL,
    INTEGRATION_NETLIFY_API_URL
} from '../variables';

// TODO: need a helper function in the future to handle integration
// envar priorities (i.e. prioritize secrets within integration or those on Infisical)

/**
 * Sync/push [secrets] to [app] in integration named [integration]
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {IIntegrationAuth} obj.integrationAuth - integration auth details
 * @param {Object} obj.app - app in integration
 * @param {Object} obj.target - (optional) target (environment) in integration
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for integration
 */
const syncSecrets = async ({
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
    try {
        switch (integration.integration) {
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
        }
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed to sync secrets to integration');
    }
}

/**
 * Sync/push [secrets] to Heroku [app]
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 */
const syncSecretsHeroku = async ({
    integration,
    secrets,
    accessToken
}: {
    integration: IIntegration,
    secrets: any;
    accessToken: string;
}) => {
    try {
        const herokuSecrets = (await axios.get( 
            `${INTEGRATION_HEROKU_API_URL}/apps/${integration.app}/config-vars`,
            {
                headers: {
                    Accept: 'application/vnd.heroku+json; version=3',
                    Authorization: `Bearer ${accessToken}`
                }
            }
        )).data;
        
        Object.keys(herokuSecrets).forEach(key => {
            if (!(key in secrets)) {
                secrets[key] = null;
            }
        });

        await axios.patch(
			`${INTEGRATION_HEROKU_API_URL}/apps/${integration.app}/config-vars`,
		    secrets,
			{
				headers: {
					Accept: 'application/vnd.heroku+json; version=3',
					Authorization: `Bearer ${accessToken}`
				}
			}
		);
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed to sync secrets to Heroku');
    }
}

/**
 * Sync/push [secrets] to Heroku [app]
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 */
const syncSecretsVercel = async ({
    integration,
    secrets,
    accessToken
}: {
    integration: IIntegration,
    secrets: any;
    accessToken: string;
}) => {
    
    interface VercelSecret {
        id?: string;
        type: string;
        key: string;
        value: string;
        target: string[];
    }
    
    try {
        // Get all (decrypted) secrets back from Vercel in
        // decrypted format
        const params = new URLSearchParams({
            decrypt: "true"
        });
        
        const res = (await Promise.all((await axios.get(
            `${INTEGRATION_VERCEL_API_URL}/v9/projects/${integration.app}/env`, 
            {
                params,
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            }
        ))
        .data
        .envs
        .filter((secret: VercelSecret) => secret.target.includes(integration.target))
        .map(async (secret: VercelSecret) => (await axios.get(
                `${INTEGRATION_VERCEL_API_URL}/v9/projects/${integration.app}/env/${secret.id}`,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                    
                }
            )).data)
        )).reduce((obj: any, secret: any) => ({
            ...obj,
            [secret.key]: secret
        }), {});
        
        let updateSecrets: VercelSecret[] = [];
        let deleteSecrets: VercelSecret[] = [];
        let newSecrets: VercelSecret[] = [];

        // Identify secrets to create
        Object.keys(secrets).map((key) => {
            if (!(key in res)) {
                // case: secret has been created
                newSecrets.push({
                    key: key,
                    value: secrets[key],
                    type: 'encrypted',
                    target: [integration.target]
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
                        type: 'encrypted',
                        target: [integration.target]
                    });
                }
            } else {
                // case: secret has been deleted
                deleteSecrets.push({
                    id: res[key].id,
                    key: key,
                    value: res[key].value,
                    type: 'encrypted',
                    target: [integration.target],
                });
            }
        });

        // Sync/push new secrets
        if (newSecrets.length > 0) {
            await axios.post(
                `${INTEGRATION_VERCEL_API_URL}/v10/projects/${integration.app}/env`,
                newSecrets,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                }
            );
        }

        // Sync/push updated secrets
        if (updateSecrets.length > 0) {
            updateSecrets.forEach(async (secret: VercelSecret) => {
                const { 
                    id, 
                    ...updatedSecret 
                } = secret;
                await axios.patch(
                    `${INTEGRATION_VERCEL_API_URL}/v9/projects/${integration.app}/env/${secret.id}`,
                    updatedSecret,
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}` 
                        }
                    }
                );
            });
        }

        // Delete secrets
        if (deleteSecrets.length > 0) {
            deleteSecrets.forEach(async (secret: VercelSecret) => {
                await axios.delete(
                    `${INTEGRATION_VERCEL_API_URL}/v9/projects/${integration.app}/env/${secret.id}`,
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`
                        }
                    }
                );
            });
        }
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed to sync secrets to Vercel');
    }
}

/**
 * Sync/push [secrets] to Netlify site [app]
 * @param {Object} obj
 * @param {IIntegration} obj.integration - integration details
 * @param {IIntegrationAuth} obj.integrationAuth - integration auth details
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 */
const syncSecretsNetlify = async ({
    integration,
    integrationAuth,
    secrets,
    accessToken
}: {
    integration: IIntegration;
    integrationAuth: IIntegrationAuth;
    secrets: any;
    accessToken: string;
}) => {
    try {
        const getParams = new URLSearchParams({
            context_name: integration.context,
            site_id: integration.siteId
        });
        
        const res = (await axios.get(
            `${INTEGRATION_NETLIFY_API_URL}/api/v1/accounts/${integrationAuth.accountId}/env`,
            {
                params: getParams,
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            }
        ))
        .data
        .reduce((obj: any, secret: any) => ({
            ...obj,
            [secret.key]: secret.values[0].value
        }), {});
        
        interface UpdateNetlifySecret {
            key: string;
            context: string;
            value: string;
        }
        
        interface DeleteNetlifySecret {
            key: string;
        }
        
        interface NewNetlifySecretValue {
            value: string;
            context: string;
        }
        
        interface NewNetlifySecret {
            key: string;
            values: NewNetlifySecretValue[];
        }
        
        let updateSecrets: UpdateNetlifySecret[] = [];
        let deleteSecrets: DeleteNetlifySecret[] = [];
        let newSecrets: NewNetlifySecret[] = [];

        // Identify secrets to create
        Object.keys(secrets).map((key) => {
            if (!(key in res)) {
                // case: secret has been created
                newSecrets.push({
                    key: key,
                    values: [{
                        value: secrets[key], // include id?
                        context: integration.context
                    }]
                });
            }
        });
        
        // Identify secrets to update and delete
        Object.keys(res).map((key) => {
            if (key in secrets) {
                if (res[key] !== secrets[key]) {
                    // case: secret value has changed
                    updateSecrets.push({
                        key: key,
                        context: integration.context,
                        value: secrets[key]
                    });
                }
            } else {
                // case: secret has been deleted
                deleteSecrets.push({
                    key
                });
            }
        });
        
        const syncParams = new URLSearchParams({
            site_id: integration.siteId
        });

        // Sync/push new secrets
        if (newSecrets.length > 0) {
            await axios.post(
                `${INTEGRATION_NETLIFY_API_URL}/api/v1/accounts/${integrationAuth.accountId}/env`,
                newSecrets,
                {
                    params: syncParams,
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                }
            );
        }

        // Sync/push updated secrets
        if (updateSecrets.length > 0) {
            
            updateSecrets.forEach(async (secret: UpdateNetlifySecret) => {
                await axios.patch(
                    `${INTEGRATION_NETLIFY_API_URL}/api/v1/accounts/${integrationAuth.accountId}/env/${secret.key}`,
                    {
                        context: secret.context,
                        value: secret.value
                    },
                    {
                        params: syncParams,
                        headers: {
                            Authorization: `Bearer ${accessToken}` 
                        }
                    }
                );
            });
        }

        // Delete secrets
        if (deleteSecrets.length > 0) {
            deleteSecrets.forEach(async (secret: DeleteNetlifySecret) => {
                await axios.delete(
                    `${INTEGRATION_NETLIFY_API_URL}/api/v1/accounts/${integrationAuth.accountId}/env/${secret.key}`,
                    {
                        params: syncParams,
                        headers: {
                            Authorization: `Bearer ${accessToken}`
                        }
                    }
                );
            });
        }
        
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed to sync secrets to Heroku');
    }
}

export {
    syncSecrets
}