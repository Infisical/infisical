import * as Sentry from '@sentry/node';
import {
    Integration,
    Bot,
    BotSequence
} from '../models';
import { exchangeCode } from '../integrations';
import { processOAuthTokenRes2 } from '../helpers/integrationAuth';
import { 
    ENV_DEV, 
    EVENT_PUSH_SECRETS
} from '../variables';

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
        console.log('IntegrationService > handleO')
        let action;
        try {
            
            const bot = await Bot.find({
                workspace: workspaceId,
                isActive: true
            });
            
            if (!bot) throw new Error('Bot must be enabled for OAuth2 code-token exchange');
            
            // exchange code for access and refresh tokens
            let res = await exchangeCode({
                integration,
                code
            });
            
            const integrationAuth = await processOAuthTokenRes2({
                workspaceId,
                integration,
                accessToken: res.accessToken,
                accessExpiresAt: res.accessExpiresAt,
                refreshToken: res.refreshToken
            });

            await Integration.findOneAndUpdate(
                { workspace: workspaceId, integration },
                {
                    workspace: workspaceId,
                    environment: ENV_DEV,
                    isActive: false,
                    app: null,
                    integration,
                    integrationAuth: integrationAuth._id
                },
                { upsert: true, new: true }
		    );
            
            // add bot sequence
            await BotSequence.findOneAndUpdate({
                bot: bot._id,
                name: integration + 'sequence',
                event: EVENT_PUSH_SECRETS,
                action
            });
        } catch (err) {
            console.error('IntegrationService error', err);
            Sentry.setUser(null);
            Sentry.captureException(err);
            throw new Error('Failed to handle OAuth2 code-token exchange')
        }
    }
}

export default IntegrationService;