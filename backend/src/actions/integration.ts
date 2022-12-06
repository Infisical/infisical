import { 
    Key,
    Bot, 
    IBot,
    Integration,
    IntegrationAuth
} from '../models';
import * as Sentry from '@sentry/node';
import { BotService } from '../services';

interface Event {
    name: string;
    workspaceId: string;
    payload: any;
}

/**
 * Push secrets to Heroku
 * @param {Object} obj
 * @param {Event} obj.event
 * @param {IBot} obj.bot
 */
const actionPushToHeroku = ({
    event,
    bot
}: {
    event: Event,
    bot: IBot
}) => {
    
    // TODO: push secrets in [event]
    // event: name, workspaceId, payload (environment, secrets)
    try {
        
        // 1. Bot needs to decrypt their project key 
        // 2. Bot needs to decrypt secrets
        // 3. Query IntegrationAuth for credentials
        // 4. Decrypt integration refresh and token
        // 5. Query Integration for integration details
        // 6. Push to integration
        
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
    }
}

export {
    actionPushToHeroku
}