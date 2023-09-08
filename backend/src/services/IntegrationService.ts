import { Types } from "mongoose";
import {
    getIntegrationAuthAccessHelper,
    getIntegrationAuthRefreshHelper,
    handleOAuthExchangeHelper,
    setIntegrationAuthAccessHelper,
    setIntegrationAuthRefreshHelper,
} from "../helpers/integration";
import { syncSecretsToActiveIntegrationsQueue } from "../queues/integrations/syncSecretsToThirdPartyServices";
import { IIntegrationAuth } from "../models";

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
     * @param {Object} obj1
     * @param {String} obj1.workspaceId - id of workspace
     * @param {String} obj1.environment - workspace environment
     * @param {String} obj1.integration - name of integration 
     * @param {String} obj1.code - code
     * @returns {IntegrationAuth} integrationAuth - integration authorization after OAuth2 code-token exchange
     */
    static async handleOAuthExchange({
        workspaceId,
        integration,
        code,
        environment,
        url
    }: {
        workspaceId: string;
        integration: string;
        code: string;
        environment: string;
        url?: string;
    }) {
        return await handleOAuthExchangeHelper({
            workspaceId,
            integration,
            code,
            environment,
            url
        });
    }

    /**
     * Sync/push environment variables in workspace with id [workspaceId] to
     * all associated integrations
     * @param {Object} obj
     * @param {Object} obj.workspaceId - id of workspace
     */
    static syncIntegrations({
        workspaceId,
        environment,
    }: {
        workspaceId: Types.ObjectId;
        environment?: string;
    }) {
        syncSecretsToActiveIntegrationsQueue({ workspaceId: workspaceId.toString(), environment: environment })
    }

    /**
     * Return decrypted refresh token for integration auth
     * with id [integrationAuthId]
     * @param {Object} obj
     * @param {String} obj.integrationAuthId - id of integration auth
     * @param {String} refreshToken - decrypted refresh token
     */
    static async getIntegrationAuthRefresh({ integrationAuthId }: { integrationAuthId: Types.ObjectId }) {
        return await getIntegrationAuthRefreshHelper({
            integrationAuthId,
        });
    }

    /**
     * Return decrypted access token for integration auth
     * with id [integrationAuthId]
     * @param {Object} obj
     * @param {String} obj.integrationAuthId - id of integration auth
     * @param {String} accessToken - decrypted access token
     */
    static async getIntegrationAuthAccess({ integrationAuthId }: { integrationAuthId: Types.ObjectId }) {
        return await getIntegrationAuthAccessHelper({
            integrationAuthId,
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
        refreshToken,
    }: {
        integrationAuthId: string;
        refreshToken: string;
    }): Promise<IIntegrationAuth> {
        return await setIntegrationAuthRefreshHelper({
            integrationAuthId,
            refreshToken,
        });
    }

    /**
     * Encrypt access token [accessToken] and (optionally) access id using the 
     * bot's copy of the workspace key for workspace belonging to integration auth
     * with id [integrationAuthId]
     * @param {Object} obj
     * @param {String} obj.integrationAuthId - id of integration auth
     * @param {String} obj.accessId - access id
     * @param {String} obj.accessToken - access token
     * @param {Date} obj.accessExpiresAt - expiration date of access token
     * @returns {IntegrationAuth} - updated integration auth
     */
    static async setIntegrationAuthAccess({
        integrationAuthId,
        accessId,
        accessToken,
        accessExpiresAt,
    }: {
        integrationAuthId: string;
        accessId?: string;
        accessToken?: string;
        accessExpiresAt: Date | undefined;
    }) {
        return await setIntegrationAuthAccessHelper({
            integrationAuthId,
            accessId,
            accessToken,
            accessExpiresAt,
        });
    }
}

export default IntegrationService;