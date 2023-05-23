import { Bot, IBot } from '../models';
import * as Sentry from '@sentry/node';
import { EVENT_PUSH_SECRETS } from '../variables';
import { IntegrationService } from '../services';

interface Event {
    name: string;
    workspaceId: string;
    payload: any;
}

/**
 * Handle event [event]
 * @param {Object} obj
 * @param {Event} obj.event - an event
 * @param {String} obj.event.name - name of event
 * @param {String} obj.event.workspaceId - id of workspace that event is part of
 * @param {Object} obj.event.payload - payload of event (depends on event)
 */
const handleEventHelper = async ({
    event
}: {
    event: Event;
}) => {
    const { workspaceId } = event;
    
    // TODO: moduralize bot check into separate function
    const bot = await Bot.findOne({
        workspace: workspaceId,
        isActive: true
    });
    
    if (!bot) return;
    
    try {
        switch (event.name) {
            case EVENT_PUSH_SECRETS:
                IntegrationService.syncIntegrations({
                    workspaceId
                });
                break;
        }
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
    }
}

export {
    handleEventHelper
}