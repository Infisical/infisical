import * as Sentry from '@sentry/node';
import {
    Integration
} from '../models';
import { 
    handleOAuthExchangeHelper,
    syncIntegrationsHelper,
    getIntegrationAuthRefreshHelper,
    getIntegrationAuthAccessHelper,
    setIntegrationAuthRefreshHelper,
    setIntegrationAuthAccessHelper,
} from '../helpers/integration';
import { exchangeCode } from '../integrations';
import { 
    ENV_DEV, 
    EVENT_PUSH_SECRETS
} from '../variables';

// should sync stuff be here too? Probably.
// TODO: move bot functions to IntegrationService.

/**
 * Class to handle integrations
 */
class IntegrationService {
    
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
    static async handleOAuthExchange({ 
        workspaceId,
        integration,
        code
    }: { 
        workspaceId: string;
        integration: string;
        code: string;
    }) {
        await handleOAuthExchangeHelper({
            workspaceId,
            integration,
            code
        });
    }
    
    /**
     * Sync/push environment variables in workspace with id [workspaceId] to
     * all associated integrations
     * @param {Object} obj
     * @param {Object} obj.workspaceId - id of workspace
     */
    static async syncIntegrations({
        workspaceId
    }: {
        workspaceId: string;
    }) {
        return await syncIntegrationsHelper({
            workspaceId
        });
    }
    
    /**
     * Return decrypted refresh token for integration auth
     * with id [integrationAuthId]
     * @param {Object} obj
     * @param {String} obj.integrationAuthId - id of integration auth
     * @param {String} refreshToken - decrypted refresh token
     */
    static async getIntegrationAuthRefresh({ integrationAuthId }: { integrationAuthId: string}) {
        return await getIntegrationAuthRefreshHelper({
            integrationAuthId
        });
    }
    
    /**
     * Return decrypted access token for integration auth
     * with id [integrationAuthId]
     * @param {Object} obj
     * @param {String} obj.integrationAuthId - id of integration auth
     * @param {String} accessToken - decrypted access token
     */
    static async getIntegrationAuthAccess({ integrationAuthId }: { integrationAuthId: string}) {
        return await getIntegrationAuthAccessHelper({
            integrationAuthId
        });
    }

    /**
     * Encrypt refresh token [refreshToken] using the bot's copy
     * of the workspace key for workspace belonging to integration auth
     * with id [integrationAuthId]
     * @param {Object} obj
     * @param {String} obj.integrationAuthId - id of integration auth
     * @param {String} obj.refreshToken - refresh token
     * @returns {IntegrationAuth} integrationAuth - updated integration auth
     */
    static async setIntegrationAuthRefresh({ 
        integrationAuthId,
        refreshToken 
    }: { 
        integrationAuthId: string; 
        refreshToken: string;
    }) {
        return await setIntegrationAuthRefreshHelper({
            integrationAuthId,
            refreshToken
        });
    }

    /**
     * Encrypt access token [accessToken] using the bot's copy
     * of the workspace key for workspace belonging to integration auth
     * with id [integrationAuthId]
     * @param {Object} obj
     * @param {String} obj.integrationAuthId - id of integration auth
     * @param {String} obj.accessToken - access token
     * @param {String} obj.accessExpiresAt - expiration date of access token
     * @returns {IntegrationAuth} - updated integration auth
     */
    static async setIntegrationAuthAccess({ 
        integrationAuthId,
        accessToken,
        accessExpiresAt
    }: { 
        integrationAuthId: string;
        accessToken: string;
        accessExpiresAt: Date;
    }) {
        return await setIntegrationAuthAccessHelper({
            integrationAuthId,
            accessToken,
            accessExpiresAt
        });
    }
}

export default IntegrationService;