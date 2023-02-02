import * as Sentry from '@sentry/node';
import {
    Bot,
    Integration,
    IntegrationAuth,
} from '../models';
import { exchangeCode, exchangeRefresh, syncSecrets } from '../integrations';
import { BotService } from '../services';
import {
    INTEGRATION_VERCEL,
    INTEGRATION_NETLIFY
} from '../variables';
import { UnauthorizedRequestError } from '../utils/errors';
import RequestError from '../utils/requestError';

interface Update {
    workspace: string;
    integration: string;
    teamId?: string;
    accountId?: string;
}

/**
 * Perform OAuth2 code-token exchange for workspace with id [workspaceId] and integration
 * named [integration]
 * - Store integration access and refresh tokens returned from the OAuth2 code-token exchange
 * - Add placeholder inactive integration
 * - Create bot sequence for integration
 * @param {Object} obj
 * @param {String} obj.workspaceId - id of workspace
 * @param {String} obj.integration - name of integration 
 * @param {String} obj.code - code
*/
const handleOAuthExchangeHelper = async ({
    workspaceId,
    integration,
    code,
    environment
}: {
    workspaceId: string;
    integration: string;
    code: string;
    environment: string;
}) => {
    let action;
    let integrationAuth;
    try {
        const bot = await Bot.findOne({
            workspace: workspaceId,
            isActive: true
        });
        
        if (!bot) throw new Error('Bot must be enabled for OAuth2 code-token exchange');
        
        // exchange code for access and refresh tokens
        const res = await exchangeCode({
            integration,
            code
        });
        
        const update: Update = {
            workspace: workspaceId,
            integration
        }
        
        switch (integration) {
            case INTEGRATION_VERCEL:
                update.teamId = res.teamId;
                break;
            case INTEGRATION_NETLIFY:
                update.accountId = res.accountId;
                break;
        }
        
        integrationAuth = await IntegrationAuth.findOneAndUpdate({
            workspace: workspaceId,
            integration
        }, update, {
            new: true,
            upsert: true
        });
        
        if (res.refreshToken) {
            // case: refresh token returned from exchange
            // set integration auth refresh token
            await setIntegrationAuthRefreshHelper({
                integrationAuthId: integrationAuth._id.toString(),
                refreshToken: res.refreshToken
            });
        }
        
        if (res.accessToken) {
            // case: access token returned from exchange
            // set integration auth access token
            await setIntegrationAuthAccessHelper({
                integrationAuthId: integrationAuth._id.toString(),
                accessToken: res.accessToken,
                accessExpiresAt: res.accessExpiresAt
            });
        }

        // initialize new integration after exchange
        await new Integration({
            workspace: workspaceId,
            isActive: false,
            app: null,
            environment,
            integration,
            integrationAuth: integrationAuth._id
        }).save();
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed to handle OAuth2 code-token exchange')
    }
}
/**
 * Sync/push environment variables in workspace with id [workspaceId] to
 * all active integrations for that workspace
 * @param {Object} obj
 * @param {Object} obj.workspaceId - id of workspace
 */
const syncIntegrationsHelper = async ({
    workspaceId
}: {
    workspaceId: string;
}) => {
    let integrations;
    try {
        integrations = await Integration.find({
            workspace: workspaceId,
            isActive: true,
            app: { $ne: null }
        });

        // for each workspace integration, sync/push secrets
        // to that integration
        for await (const integration of integrations) {
            // get workspace, environment (shared) secrets
            const secrets = await BotService.getSecrets({ // issue here?
                workspaceId: integration.workspace.toString(),
                environment: integration.environment
            });

            const integrationAuth = await IntegrationAuth.findById(integration.integrationAuth);
            if (!integrationAuth) throw new Error('Failed to find integration auth');
            
            // get integration auth access token
            const accessToken = await getIntegrationAuthAccessHelper({
                integrationAuthId: integration.integrationAuth.toString()
            });

            // sync secrets to integration
            await syncSecrets({
                integration,
                integrationAuth,
                secrets,
                accessToken
            });
        }
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed to sync secrets to integrations');
    }
}

/**
 * Return decrypted refresh token using the bot's copy
 * of the workspace key for workspace belonging to integration auth
 * with id [integrationAuthId]
 * @param {Object} obj
 * @param {String} obj.integrationAuthId - id of integration auth
 * @param {String} refreshToken - decrypted refresh token
 */
 const getIntegrationAuthRefreshHelper = async ({ integrationAuthId }: { integrationAuthId: string }) => {
    let refreshToken;
	
    try {
        const integrationAuth = await IntegrationAuth
            .findById(integrationAuthId)
            .select('+refreshCiphertext +refreshIV +refreshTag');

        if (!integrationAuth) throw UnauthorizedRequestError({message: 'Failed to locate Integration Authentication credentials'});

        refreshToken = await BotService.decryptSymmetric({
            workspaceId: integrationAuth.workspace.toString(),
            ciphertext: integrationAuth.refreshCiphertext as string,
            iv: integrationAuth.refreshIV as string,
            tag: integrationAuth.refreshTag as string
        });

    } catch (err) {
        Sentry.setUser(null);
		Sentry.captureException(err);
        if(err instanceof RequestError)
            throw err
        else
            throw new Error('Failed to get integration refresh token');
    }
    
    return refreshToken;
}

/**
 * Return decrypted access token using the bot's copy
 * of the workspace key for workspace belonging to integration auth
 * with id [integrationAuthId]
 * @param {Object} obj
 * @param {String} obj.integrationAuthId - id of integration auth
 * @returns {String} accessToken - decrypted access token
 */
const getIntegrationAuthAccessHelper = async ({ integrationAuthId }: { integrationAuthId: string }) => {
    let accessToken;
	
    try {
        const integrationAuth = await IntegrationAuth
            .findById(integrationAuthId)
            .select('workspace integration +accessCiphertext +accessIV +accessTag +accessExpiresAt + refreshCiphertext');

        if (!integrationAuth) throw UnauthorizedRequestError({message: 'Failed to locate Integration Authentication credentials'});

        accessToken = await BotService.decryptSymmetric({
            workspaceId: integrationAuth.workspace.toString(),
            ciphertext: integrationAuth.accessCiphertext as string,
            iv: integrationAuth.accessIV as string,
            tag: integrationAuth.accessTag as string
        });

        if (integrationAuth?.accessExpiresAt && integrationAuth?.refreshCiphertext) {
            // there is a access token expiration date
            // and refresh token to exchange with the OAuth2 server
            
            if (integrationAuth.accessExpiresAt < new Date()) {
                // access token is expired
                const refreshToken = await getIntegrationAuthRefreshHelper({ integrationAuthId });
                accessToken = await exchangeRefresh({
                    integration: integrationAuth.integration,
                    refreshToken
                });
            }
        }

    } catch (err) {
        Sentry.setUser(null);
		Sentry.captureException(err);
        if(err instanceof RequestError)
            throw err
        else
            throw new Error('Failed to get integration access token');
    }
    
    return accessToken;
}

/**
 * Encrypt refresh token [refreshToken] using the bot's copy
 * of the workspace key for workspace belonging to integration auth
 * with id [integrationAuthId] and store it
 * @param {Object} obj
 * @param {String} obj.integrationAuthId - id of integration auth
 * @param {String} obj.refreshToken - refresh token
 */
const setIntegrationAuthRefreshHelper = async ({
    integrationAuthId,
    refreshToken
}: {
    integrationAuthId: string;
    refreshToken: string;
}) => {
    
    let integrationAuth;
    try {
        integrationAuth = await IntegrationAuth
            .findById(integrationAuthId);
        
        if (!integrationAuth) throw new Error('Failed to find integration auth');
        
        const obj = await BotService.encryptSymmetric({
            workspaceId: integrationAuth.workspace.toString(),
            plaintext: refreshToken
        });
        
        integrationAuth = await IntegrationAuth.findOneAndUpdate({
            _id: integrationAuthId
        }, {
            refreshCiphertext: obj.ciphertext,
            refreshIV: obj.iv,
            refreshTag: obj.tag
        }, {
            new: true
        });
    } catch (err) {
        Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to set integration auth refresh token');
    }
    
    return integrationAuth;
}

/**
 * Encrypt access token [accessToken] using the bot's copy
 * of the workspace key for workspace belonging to integration auth
 * with id [integrationAuthId] and store it along with [accessExpiresAt]
 * @param {Object} obj
 * @param {String} obj.integrationAuthId - id of integration auth
 * @param {String} obj.accessToken - access token
 * @param {Date} obj.accessExpiresAt - expiration date of access token
 */
const setIntegrationAuthAccessHelper = async ({
    integrationAuthId,
    accessToken,
    accessExpiresAt
}: {
    integrationAuthId: string;
    accessToken: string;
    accessExpiresAt: Date | undefined;
}) => {
    let integrationAuth;
    try {
        integrationAuth = await IntegrationAuth.findById(integrationAuthId);
        
        if (!integrationAuth) throw new Error('Failed to find integration auth');
        
        const obj = await BotService.encryptSymmetric({
            workspaceId: integrationAuth.workspace.toString(),
            plaintext: accessToken
        });
        
        integrationAuth = await IntegrationAuth.findOneAndUpdate({
            _id: integrationAuthId
        }, {
            accessCiphertext: obj.ciphertext,
            accessIV: obj.iv,
            accessTag: obj.tag,
            accessExpiresAt
        }, {
            new: true
        });
    } catch (err) {
        Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to save integration auth access token');
    }
    
    return integrationAuth;
}

export {
    handleOAuthExchangeHelper,
    syncIntegrationsHelper,
    getIntegrationAuthRefreshHelper,
    getIntegrationAuthAccessHelper,
    setIntegrationAuthRefreshHelper,
    setIntegrationAuthAccessHelper
}