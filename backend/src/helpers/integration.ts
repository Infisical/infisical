import * as Sentry from '@sentry/node';
import { Types } from 'mongoose';
import {
    Bot,
    Integration,
    IntegrationAuth,
    IUser,
    User,
    IServiceAccount,
    ServiceAccount,
    IServiceTokenData,
    ServiceTokenData
} from '../models';
import { exchangeCode, exchangeRefresh, syncSecrets } from '../integrations';
import { BotService } from '../services';
import {
    AUTH_MODE_JWT,
	AUTH_MODE_SERVICE_ACCOUNT,
	AUTH_MODE_SERVICE_TOKEN,
	AUTH_MODE_API_KEY,
    INTEGRATION_VERCEL,
    INTEGRATION_NETLIFY
} from '../variables';
import { 
    UnauthorizedRequestError,
    IntegrationAuthNotFoundError,
    IntegrationNotFoundError
} from '../utils/errors';
import RequestError from '../utils/requestError';
import {
    validateClientForIntegrationAuth 
} from '../helpers/integrationAuth';
import {
    validateUserClientForWorkspace
} from '../helpers/user';
import {
    validateServiceAccountClientForWorkspace
} from '../helpers/serviceAccount';
import { IntegrationService } from '../services';

interface Update {
    workspace: string;
    integration: string;
    teamId?: string;
    accountId?: string;
}

/**
 * Validate authenticated clients for integration with id [integrationId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.integrationId - id of integration to validate against
 * @param {String} obj.environment - (optional) environment in workspace to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.requiredPermissions - required permissions as part of the endpoint
 */
 const validateClientForIntegration = async ({
    authData,
    integrationId,
    acceptedRoles
}: {
    authData: {
		authMode: string;
		authPayload: IUser | IServiceAccount | IServiceTokenData;
	};
    integrationId: Types.ObjectId;
    acceptedRoles: Array<'admin' | 'member'>;
}) => {
    
    const integration = await Integration.findById(integrationId);
    if (!integration) throw IntegrationNotFoundError();

    const integrationAuth = await IntegrationAuth
        .findById(integrationId)
        .select(
			'+refreshCiphertext +refreshIV +refreshTag +accessCiphertext +accessIV +accessTag +accessExpiresAt'
        );
    
    if (!integrationAuth) throw IntegrationAuthNotFoundError();

    const accessToken = (await IntegrationService.getIntegrationAuthAccess({
        integrationAuthId: integrationAuth._id
    })).accessToken;

    if (authData.authMode === AUTH_MODE_JWT && authData.authPayload instanceof User) {
        await validateUserClientForWorkspace({
            user: authData.authPayload,
            workspaceId: integration.workspace,
            acceptedRoles
        });
        
        return ({ integration, accessToken });
    }
    
    if (authData.authMode === AUTH_MODE_SERVICE_ACCOUNT && authData.authPayload instanceof ServiceAccount) {
        await validateServiceAccountClientForWorkspace({
            serviceAccount: authData.authPayload,
            workspaceId: integration.workspace
        });
        
        return ({ integration, accessToken });
    }

    if (authData.authMode === AUTH_MODE_SERVICE_TOKEN && authData.authPayload instanceof ServiceTokenData) {
        throw UnauthorizedRequestError({
            message: 'Failed service token authorization for integration'
        });
    }

    if (authData.authMode === AUTH_MODE_API_KEY && authData.authPayload instanceof User) {
        await validateUserClientForWorkspace({
            user: authData.authPayload,
            workspaceId: integration.workspace,
            acceptedRoles
        });
        
        return ({ integration, accessToken });
    }
    
    throw UnauthorizedRequestError({
        message: 'Failed client authorization for integration'
    });
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
 * @returns {IntegrationAuth} integrationAuth - integration auth after OAuth2 code-token exchange
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
                accessId: null,
                accessToken: res.accessToken,
                accessExpiresAt: res.accessExpiresAt
            });
        }
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed to handle OAuth2 code-token exchange')
    }
    
    return integrationAuth;
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
            const access = await getIntegrationAuthAccessHelper({
                integrationAuthId: integration.integrationAuth
            });

            // sync secrets to integration
            await syncSecrets({
                integration,
                integrationAuth,
                secrets,
                accessId: access.accessId,
                accessToken: access.accessToken
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
 const getIntegrationAuthRefreshHelper = async ({ integrationAuthId }: { integrationAuthId: Types.ObjectId }) => {
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
const getIntegrationAuthAccessHelper = async ({ integrationAuthId }: { integrationAuthId: Types.ObjectId }) => {
    let accessId;
    let accessToken;
    try {
        const integrationAuth = await IntegrationAuth
            .findById(integrationAuthId)
            .select('workspace integration +accessCiphertext +accessIV +accessTag +accessExpiresAt + refreshCiphertext +accessIdCiphertext +accessIdIV +accessIdTag');

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
                    integrationAuth,
                    refreshToken
                });
            }
        }
        
        if (integrationAuth?.accessIdCiphertext && integrationAuth?.accessIdIV && integrationAuth?.accessIdTag) {
            accessId = await BotService.decryptSymmetric({
                workspaceId: integrationAuth.workspace.toString(),
                ciphertext: integrationAuth.accessIdCiphertext as string,
                iv: integrationAuth.accessIdIV as string,
                tag: integrationAuth.accessIdTag as string
            });
        }

    } catch (err) {
        Sentry.setUser(null);
		Sentry.captureException(err);
        if(err instanceof RequestError)
            throw err
        else
            throw new Error('Failed to get integration access token');
    }
    
    return ({
        accessId,
        accessToken
    });
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
 * Encrypt access token [accessToken] and (optionally) access id [accessId]
 * using the bot's copy of the workspace key for workspace belonging to 
 * integration auth with id [integrationAuthId] and store it along with [accessExpiresAt]
 * @param {Object} obj
 * @param {String} obj.integrationAuthId - id of integration auth
 * @param {String} obj.accessToken - access token
 * @param {Date} obj.accessExpiresAt - expiration date of access token
 */
const setIntegrationAuthAccessHelper = async ({
    integrationAuthId,
    accessId,
    accessToken,
    accessExpiresAt
}: {
    integrationAuthId: string;
    accessId: string | null;
    accessToken: string;
    accessExpiresAt: Date | undefined;
}) => {
    let integrationAuth;
    try {
        integrationAuth = await IntegrationAuth.findById(integrationAuthId);
        
        if (!integrationAuth) throw new Error('Failed to find integration auth');
        
        const encryptedAccessTokenObj = await BotService.encryptSymmetric({
            workspaceId: integrationAuth.workspace.toString(),
            plaintext: accessToken
        });
        
        let encryptedAccessIdObj;
        if (accessId) {
            encryptedAccessIdObj = await BotService.encryptSymmetric({
                workspaceId: integrationAuth.workspace.toString(),
                plaintext: accessId
            }); 
        }
        
        integrationAuth = await IntegrationAuth.findOneAndUpdate({
            _id: integrationAuthId
        }, {
            accessIdCiphertext: encryptedAccessIdObj?.ciphertext ?? undefined,
            accessIdIV: encryptedAccessIdObj?.iv ?? undefined,
            accessIdTag: encryptedAccessIdObj?.tag ?? undefined,
            accessCiphertext: encryptedAccessTokenObj.ciphertext,
            accessIV: encryptedAccessTokenObj.iv,
            accessTag: encryptedAccessTokenObj.tag,
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
    validateClientForIntegration,
    handleOAuthExchangeHelper,
    syncIntegrationsHelper,
    getIntegrationAuthRefreshHelper,
    getIntegrationAuthAccessHelper,
    setIntegrationAuthRefreshHelper,
    setIntegrationAuthAccessHelper
}